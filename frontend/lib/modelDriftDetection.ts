import { AuditReport, DriftAlert } from '../types';
import { calculateBCaConfidenceInterval } from './statisticalAnalysis';

/**
 * Model drift detection: Implement canary prompts, fingerprint tracking,
 * benchmark regression, threshold alerts (>5% degradation).
 */

export interface CanaryPrompt {
  canary_id: string;
  prompt_text: string;
  expected_response_pattern?: string;
  created_at: string;
}

export interface CanaryBaseline {
  canary_id: string;
  model_name: string;
  baseline_score: number;
  baseline_stddev: number;
  baseline_fingerprint?: string;
  established_at: string;
  sample_count: number;
}

export interface DriftDetectionResult {
  canary_id: string;
  model_name: string;
  current_score: number;
  baseline_score: number;
  degradation: number; // Percentage degradation
  drift_detected: boolean;
  statistical_test: {
    test_type: 'ks' | 'psi' | 't_test';
    statistic: number;
    p_value: number;
    significant: boolean;
  };
  alert_triggered: boolean;
  impact_assessment?: {
    affected_reports_count: number;
    severity: 'low' | 'medium' | 'high';
  };
}

/**
 * Perform Kolmogorov-Smirnov test for distribution drift
 */
export function performKSTest(
  baselineScores: number[],
  currentScores: number[]
): {
  statistic: number;
  p_value: number;
  significant: boolean;
} {
  if (baselineScores.length === 0 || currentScores.length === 0) {
    throw new Error('Both score arrays must be non-empty');
  }
  
  // Sort both arrays
  const sortedBaseline = [...baselineScores].sort((a, b) => a - b);
  const sortedCurrent = [...currentScores].sort((a, b) => a - b);
  
  // Calculate empirical CDFs
  const n1 = sortedBaseline.length;
  const n2 = sortedCurrent.length;
  
  // KS statistic: maximum difference between CDFs
  let maxDiff = 0;
  let i = 0;
  let j = 0;
  
  while (i < n1 || j < n2) {
    let x: number;
    if (j >= n2 || (i < n1 && sortedBaseline[i] <= sortedCurrent[j])) {
      x = sortedBaseline[i];
      i++;
    } else {
      x = sortedCurrent[j];
      j++;
    }
    
    // Calculate CDF values at x
    const cdf1 = sortedBaseline.filter(s => s <= x).length / n1;
    const cdf2 = sortedCurrent.filter(s => s <= x).length / n2;
    
    const diff = Math.abs(cdf1 - cdf2);
    maxDiff = Math.max(maxDiff, diff);
  }
  
  // Approximate p-value using KS distribution
  // Simplified approximation - full implementation would use proper KS distribution
  const n = Math.sqrt((n1 * n2) / (n1 + n2));
  const criticalValue = 1.36 / Math.sqrt(n1 + n2); // 95% confidence
  
  const p_value = maxDiff > criticalValue ? 0.01 : 0.5; // Simplified
  const significant = maxDiff > criticalValue;
  
  return {
    statistic: maxDiff,
    p_value,
    significant
  };
}

/**
 * Calculate Population Stability Index (PSI)
 * Measures distribution shift between baseline and current
 */
export function calculatePSI(
  baselineScores: number[],
  currentScores: number[],
  bins: number = 10
): {
  psi: number;
  interpretation: 'no_change' | 'minor' | 'moderate' | 'major';
  significant: boolean;
} {
  if (baselineScores.length === 0 || currentScores.length === 0) {
    throw new Error('Both score arrays must be non-empty');
  }
  
  // Create bins
  const min = Math.min(...baselineScores, ...currentScores);
  const max = Math.max(...baselineScores, ...currentScores);
  const binWidth = (max - min) / bins;
  
  // Count scores in each bin for baseline and current
  const baselineCounts = new Array(bins).fill(0);
  const currentCounts = new Array(bins).fill(0);
  
  for (const score of baselineScores) {
    const binIndex = Math.min(Math.floor((score - min) / binWidth), bins - 1);
    baselineCounts[binIndex]++;
  }
  
  for (const score of currentScores) {
    const binIndex = Math.min(Math.floor((score - min) / binWidth), bins - 1);
    currentCounts[binIndex]++;
  }
  
  // Normalize to proportions
  const baselineTotal = baselineScores.length;
  const currentTotal = currentScores.length;
  
  const baselineProportions = baselineCounts.map(c => c / baselineTotal);
  const currentProportions = currentCounts.map(c => c / currentTotal);
  
  // Calculate PSI
  let psi = 0;
  for (let i = 0; i < bins; i++) {
    const baselineProp = baselineProportions[i] || 0.0001; // Avoid log(0)
    const currentProp = currentProportions[i] || 0.0001;
    
    psi += (currentProp - baselineProp) * Math.log(currentProp / baselineProp);
  }
  
  // Interpret PSI
  let interpretation: 'no_change' | 'minor' | 'moderate' | 'major';
  let significant: boolean;
  
  if (psi < 0.1) {
    interpretation = 'no_change';
    significant = false;
  } else if (psi < 0.25) {
    interpretation = 'minor';
    significant = false;
  } else if (psi < 0.5) {
    interpretation = 'moderate';
    significant = true;
  } else {
    interpretation = 'major';
    significant = true;
  }
  
  return {
    psi,
    interpretation,
    significant
  };
}

/**
 * Detect model drift using canary prompts
 */
export function detectModelDrift(
  baseline: CanaryBaseline,
  currentReports: AuditReport[],
  threshold: number = 0.05 // 5% degradation threshold
): DriftDetectionResult {
  if (currentReports.length === 0) {
    throw new Error('Current reports array must be non-empty');
  }
  
  // Extract current scores
  const currentScores = currentReports.map(r => r.overall_score);
  const currentMean = currentScores.reduce((sum, s) => sum + s, 0) / currentScores.length;
  
  // Calculate degradation
  const degradation = (baseline.baseline_score - currentMean) / baseline.baseline_score;
  const driftDetected = degradation > threshold;
  
  // Perform statistical test (KS test)
  // For baseline, we'd need historical scores - simplified here
  const baselineScores = generateBaselineScores(baseline);
  const ksTest = performKSTest(baselineScores, currentScores);
  
  // Also calculate PSI
  const psiResult = calculatePSI(baselineScores, currentScores);
  
  // Use PSI if available, otherwise KS test
  const statisticalTest = psiResult.significant ? {
    test_type: 'psi' as const,
    statistic: psiResult.psi,
    p_value: 0.01, // Simplified
    significant: psiResult.significant
  } : {
    test_type: 'ks' as const,
    statistic: ksTest.statistic,
    p_value: ksTest.p_value,
    significant: ksTest.significant
  };
  
  // Check fingerprint change (if available)
  const fingerprintChanged = currentReports.some(r => 
    r.system_fingerprint && 
    r.system_fingerprint !== baseline.baseline_fingerprint
  );
  
  const alertTriggered = driftDetected || statisticalTest.significant || fingerprintChanged;
  
  return {
    canary_id: baseline.canary_id,
    model_name: baseline.model_name,
    current_score: currentMean,
    baseline_score: baseline.baseline_score,
    degradation: degradation * 100, // Convert to percentage
    drift_detected: driftDetected || statisticalTest.significant,
    statistical_test: statisticalTest,
    alert_triggered: alertTriggered,
    impact_assessment: alertTriggered ? {
      affected_reports_count: currentReports.length,
      severity: degradation > 0.1 ? 'high' : degradation > 0.05 ? 'medium' : 'low'
    } : undefined
  };
}

/**
 * Generate baseline scores from baseline statistics
 * (In production, would use actual historical scores)
 */
function generateBaselineScores(baseline: CanaryBaseline): number[] {
  // Generate synthetic scores based on baseline mean and stddev
  // In production, would use actual historical data
  const scores: number[] = [];
  for (let i = 0; i < baseline.sample_count; i++) {
    // Simple normal approximation
    const score = baseline.baseline_score + 
      (Math.random() - 0.5) * baseline.baseline_stddev * 2;
    scores.push(Math.max(0, Math.min(1, score))); // Clamp to [0, 1]
  }
  return scores;
}

/**
 * Create drift alert
 */
export function createDriftAlert(
  detectionResult: DriftDetectionResult,
  canaryPrompt: CanaryPrompt
): DriftAlert {
  return {
    alert_id: `alert-${detectionResult.canary_id}-${Date.now()}`,
    canary_id: detectionResult.canary_id,
    model_name: detectionResult.model_name,
    drift_type: detectionResult.degradation > 0 ? 'degradation' : 'improvement',
    magnitude: Math.abs(detectionResult.degradation),
    statistical_test: detectionResult.statistical_test.test_type,
    test_statistic: detectionResult.statistical_test.statistic,
    p_value: detectionResult.statistical_test.p_value,
    detected_at: new Date().toISOString(),
    severity: detectionResult.impact_assessment?.severity || 'low',
    mitigation_action: detectionResult.drift_detected 
      ? 'Review model version changes, check system fingerprint, investigate canary prompt responses'
      : undefined
  };
}

/**
 * Track system fingerprint changes
 */
export function trackFingerprintChange(
  oldFingerprint: string | undefined,
  newFingerprint: string | undefined,
  modelName: string
): {
  changed: boolean;
  alert: boolean;
} {
  if (!oldFingerprint || !newFingerprint) {
    return { changed: false, alert: false };
  }
  
  const changed = oldFingerprint !== newFingerprint;
  const alert = changed; // Always alert on fingerprint change
  
  return { changed, alert };
}

/**
 * Assess impact of drift on existing reports
 */
export function assessDriftImpact(
  detectionResult: DriftDetectionResult,
  allReports: AuditReport[]
): {
  affected_reports_count: number;
  affected_report_ids: string[];
  severity: 'low' | 'medium' | 'high';
  recommendation: string;
} {
  // Find reports with same model and similar parameters
  const affectedReports = allReports.filter(r => 
    r.model_name === detectionResult.model_name &&
    Math.abs(r.overall_score - detectionResult.baseline_score) > 0.1
  );
  
  const severity = detectionResult.degradation > 0.1 ? 'high' :
                   detectionResult.degradation > 0.05 ? 'medium' : 'low';
  
  let recommendation = '';
  if (detectionResult.drift_detected) {
    recommendation = `Model drift detected (${detectionResult.degradation.toFixed(1)}% degradation). ` +
      `Consider: (1) Reviewing ${affectedReports.length} affected reports, ` +
      `(2) Re-running audits with updated model, (3) Updating baseline, ` +
      `(4) Investigating model version changes.`;
  } else {
    recommendation = 'No significant drift detected. Continue monitoring.';
  }
  
  return {
    affected_reports_count: affectedReports.length,
    affected_report_ids: affectedReports.map(r => r.report_id),
    severity,
    recommendation
  };
}

/**
 * Establish baseline for canary prompt
 */
export function establishCanaryBaseline(
  canaryId: string,
  modelName: string,
  baselineReports: AuditReport[],
  fingerprint?: string
): CanaryBaseline {
  if (baselineReports.length === 0) {
    throw new Error('Need at least one baseline report');
  }
  
  const scores = baselineReports.map(r => r.overall_score);
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1);
  const stddev = Math.sqrt(variance);
  
  return {
    canary_id: canaryId,
    model_name: modelName,
    baseline_score: mean,
    baseline_stddev: stddev,
    baseline_fingerprint: fingerprint,
    established_at: new Date().toISOString(),
    sample_count: baselineReports.length
  };
}

