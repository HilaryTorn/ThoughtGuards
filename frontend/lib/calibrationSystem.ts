import { AuditReport, CalibrationMetrics, BiasAdjustedEstimate } from '../types';
import { calculateCalibrationMetrics, calculateInterRaterAgreement, LabelSet } from './statisticalAnalysis';

/**
 * Calibration system: Manage 200+ human-labeled calibration samples,
 * compute specificity/sensitivity, apply bias-adjusted estimators,
 * validate inter-annotator agreement (Cohen's κ ≥ 0.7).
 */

export interface CalibrationSample {
  conversation_id: string;
  ground_truth: boolean; // True if manipulation detected
  predicted_score: number; // Score from audit report
  manipulation_types?: string[];
  severity?: 'low' | 'medium' | 'high';
}

export interface CalibrationDataset {
  samples: CalibrationSample[];
  created_at: string;
  annotator_count: number;
  inter_annotator_agreement: number; // Cohen's kappa
  meets_quality_threshold: boolean; // κ ≥ 0.7
}

/**
 * Compute calibration metrics from dataset
 */
export function computeCalibrationMetrics(
  dataset: CalibrationDataset,
  threshold: number = 0.5
): CalibrationMetrics {
  const predictions = dataset.samples.map(s => s.predicted_score);
  const groundTruth = dataset.samples.map(s => s.ground_truth);
  
  return calculateCalibrationMetrics(predictions, groundTruth, threshold);
}

/**
 * Apply bias-adjusted estimator (Rogan-Gladen)
 * Corrects for imperfect ground truth labels
 * θ̂ = (p̂ + q₀ - 1) / (q₀ + q₁ - 1)
 * where:
 *   p̂ = observed proportion
 *   q₀ = specificity (true negative rate)
 *   q₁ = sensitivity (true positive rate)
 */
export function applyBiasAdjustedEstimator(
  calibrationMetrics: CalibrationMetrics
): BiasAdjustedEstimate {
  const p_hat = (calibrationMetrics.truePositives + calibrationMetrics.falsePositives) /
    (calibrationMetrics.truePositives + calibrationMetrics.falsePositives +
     calibrationMetrics.trueNegatives + calibrationMetrics.falseNegatives);
  
  const q0 = calibrationMetrics.specificity; // True negative rate
  const q1 = calibrationMetrics.recall; // True positive rate (sensitivity)
  
  // Rogan-Gladen estimator
  const denominator = q0 + q1 - 1;
  
  if (Math.abs(denominator) < 1e-10) {
    // Edge case: q0 + q1 ≈ 1 (perfect classifier)
    return {
      adjusted_prevalence: p_hat,
      original_prevalence: p_hat,
      sensitivity: q1,
      specificity: q0,
      adjustment_applied: false,
      confidence_interval: {
        lower: p_hat,
        upper: p_hat,
        level: 0.95
      },
      warning: 'Denominator near zero, adjustment not applied'
    };
  }
  
  const adjusted_prevalence = (p_hat + q0 - 1) / denominator;
  
  // Clamp to valid range [0, 1]
  const clamped_prevalence = Math.max(0, Math.min(1, adjusted_prevalence));
  
  // Calculate confidence interval (simplified)
  const n = calibrationMetrics.truePositives + calibrationMetrics.falsePositives +
            calibrationMetrics.trueNegatives + calibrationMetrics.falseNegatives;
  
  const se = Math.sqrt(clamped_prevalence * (1 - clamped_prevalence) / n);
  const z = 1.96; // 95% CI
  const ci_lower = Math.max(0, clamped_prevalence - z * se);
  const ci_upper = Math.min(1, clamped_prevalence + z * se);
  
  return {
    adjusted_prevalence: clamped_prevalence,
    original_prevalence: p_hat,
    sensitivity: q1,
    specificity: q0,
    adjustment_applied: true,
    confidence_interval: {
      lower: ci_lower,
      upper: ci_upper,
      level: 0.95
    }
  };
}

/**
 * Validate inter-annotator agreement
 * Requires Cohen's κ ≥ 0.7 for quality threshold
 */
export function validateInterAnnotatorAgreement(
  labels: LabelSet[]
): {
  kappa: number;
  meets_threshold: boolean;
  interpretation: 'poor' | 'fair' | 'good' | 'excellent';
  recommendation: string;
} {
  const kappa = calculateInterRaterAgreement(labels);
  const threshold = 0.7;
  const meets_threshold = kappa >= threshold;
  
  let interpretation: 'poor' | 'fair' | 'good' | 'excellent';
  if (kappa < 0.4) {
    interpretation = 'poor';
  } else if (kappa < 0.6) {
    interpretation = 'fair';
  } else if (kappa < 0.75) {
    interpretation = 'good';
  } else {
    interpretation = 'excellent';
  }
  
  let recommendation = '';
  if (!meets_threshold) {
    recommendation = `Inter-annotator agreement (κ = ${kappa.toFixed(3)}) is below threshold (${threshold}). ` +
      `Consider: (1) Reviewing annotation guidelines, (2) Training annotators, ` +
      `(3) Using expert annotators, or (4) Increasing sample size.`;
  } else {
    recommendation = `Inter-annotator agreement (κ = ${kappa.toFixed(3)}) meets quality threshold. ` +
      `Dataset is suitable for calibration.`;
  }
  
  return {
    kappa,
    meets_threshold,
    interpretation,
    recommendation
  };
}

/**
 * Create calibration dataset from ground truth labels and audit reports
 */
export function createCalibrationDataset(
  samples: CalibrationSample[],
  labels: LabelSet[]
): CalibrationDataset {
  if (samples.length < 200) {
    console.warn(`Calibration dataset has only ${samples.length} samples. ` +
      `Recommend at least 200 samples for reliable calibration.`);
  }
  
  // Validate inter-annotator agreement
  const agreement = validateInterAnnotatorAgreement(labels);
  
  // Count unique annotators
  const annotatorSet = new Set<string>();
  for (const labelSet of labels) {
    for (const label of labelSet.labels) {
      annotatorSet.add(label.annotator_id);
    }
  }
  
  return {
    samples,
    created_at: new Date().toISOString(),
    annotator_count: annotatorSet.size,
    inter_annotator_agreement: agreement.kappa,
    meets_quality_threshold: agreement.meets_threshold
  };
}

/**
 * Compute calibration metrics by manipulation type
 */
export function computeCalibrationByType(
  dataset: CalibrationDataset,
  threshold: number = 0.5
): Map<string, CalibrationMetrics> {
  const typeMetrics = new Map<string, CalibrationMetrics>();
  
  // Group samples by manipulation type
  const typeGroups = new Map<string, CalibrationSample[]>();
  for (const sample of dataset.samples) {
    if (sample.manipulation_types && sample.manipulation_types.length > 0) {
      for (const type of sample.manipulation_types) {
        if (!typeGroups.has(type)) {
          typeGroups.set(type, []);
        }
        typeGroups.get(type)!.push(sample);
      }
    } else {
      // Samples without specific type
      const key = 'unknown';
      if (!typeGroups.has(key)) {
        typeGroups.set(key, []);
      }
      typeGroups.get(key)!.push(sample);
    }
  }
  
  // Calculate metrics for each type
  for (const [type, typeSamples] of typeGroups.entries()) {
    const predictions = typeSamples.map(s => s.predicted_score);
    const groundTruth = typeSamples.map(s => s.ground_truth);
    
    const metrics = calculateCalibrationMetrics(predictions, groundTruth, threshold);
    typeMetrics.set(type, metrics);
  }
  
  return typeMetrics;
}

/**
 * Validate calibration dataset quality
 */
export function validateCalibrationDataset(
  dataset: CalibrationDataset
): {
  valid: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // Check sample size
  if (dataset.samples.length < 200) {
    issues.push(`Sample size (${dataset.samples.length}) is below recommended minimum (200)`);
    recommendations.push('Collect more calibration samples for reliable metrics');
  }
  
  // Check inter-annotator agreement
  if (!dataset.meets_quality_threshold) {
    issues.push(`Inter-annotator agreement (κ = ${dataset.inter_annotator_agreement.toFixed(3)}) is below threshold (0.7)`);
    recommendations.push('Improve annotation quality or use expert annotators');
  }
  
  // Check annotator count
  if (dataset.annotator_count < 2) {
    issues.push('Need at least 2 annotators to calculate inter-annotator agreement');
    recommendations.push('Add more annotators to the calibration dataset');
  }
  
  // Check class balance
  const positiveCount = dataset.samples.filter(s => s.ground_truth).length;
  const negativeCount = dataset.samples.length - positiveCount;
  const positiveRatio = positiveCount / dataset.samples.length;
  
  if (positiveRatio < 0.2 || positiveRatio > 0.8) {
    issues.push(`Class imbalance detected: ${(positiveRatio * 100).toFixed(1)}% positive samples`);
    recommendations.push('Consider balancing the dataset or using stratified sampling');
  }
  
  return {
    valid: issues.length === 0,
    issues,
    recommendations
  };
}

/**
 * Apply calibration to new audit report
 * Adjusts score based on calibration metrics
 */
export function applyCalibration(
  report: AuditReport,
  calibrationMetrics: CalibrationMetrics,
  biasAdjusted?: BiasAdjustedEstimate
): {
  originalScore: number;
  calibratedScore: number;
  confidence: 'low' | 'medium' | 'high';
  calibrationMethod: string;
} {
  let calibratedScore = report.overall_score;
  let calibrationMethod = 'none';
  
  // Simple calibration: adjust based on precision/recall
  // More sophisticated methods would use calibration curves
  if (biasAdjusted && biasAdjusted.adjustment_applied) {
    // Use bias-adjusted estimator
    calibratedScore = biasAdjusted.adjusted_prevalence;
    calibrationMethod = 'bias_adjusted';
  } else {
    // Simple calibration based on precision
    // If precision is low, reduce confidence in high scores
    if (calibrationMetrics.precision < 0.7) {
      calibratedScore = report.overall_score * calibrationMetrics.precision;
      calibrationMethod = 'precision_adjusted';
    }
  }
  
  // Clamp to valid range
  calibratedScore = Math.max(0, Math.min(1, calibratedScore));
  
  // Determine confidence based on calibration quality
  let confidence: 'low' | 'medium' | 'high';
  if (calibrationMetrics.precision >= 0.8 && calibrationMetrics.recall >= 0.8) {
    confidence = 'high';
  } else if (calibrationMetrics.precision >= 0.6 && calibrationMetrics.recall >= 0.6) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return {
    originalScore: report.overall_score,
    calibratedScore,
    confidence,
    calibrationMethod
  };
}

