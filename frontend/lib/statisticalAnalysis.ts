/**
 * Statistical analysis functions for audit results
 * Provides distribution metrics, confidence intervals, calibration, and inter-rater agreement
 */

export interface AuditRun {
  run_id: string;
  audit_id: string;
  conversation_id: string;
  run_number: number;
  seed?: number;
  temperature?: number;
  model_name: string;
  overall_score: number;
  confidence: "low" | "medium" | "high";
  detected_types: any[];
  metrics: any;
  created_at: string;
}

export interface DistributionMetrics {
  mean: number;
  stddev: number;
  variance: number;
  min: number;
  max: number;
  quantiles: {
    p5: number;
    p25: number;
    p50: number; // median
    p75: number;
    p95: number;
  };
  count: number;
}

// Extended DistributionMetrics for aggregate reports (includes CI)
export interface ExtendedDistributionMetrics {
  mean: number;
  stddev: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  ci_lower: number;
  ci_upper: number;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number; // e.g., 0.95 for 95% CI
  method: 'bootstrap' | 'normal' | 't-distribution';
}

export interface CalibrationMetrics {
  precision: number;
  recall: number;
  f1: number;
  specificity: number;
  accuracy: number;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface LabelSet {
  conversation_id: string;
  labels: Array<{
    annotator_id: string;
    is_manipulation: boolean;
    confidence: "low" | "medium" | "high";
  }>;
}

/**
 * Calculate distribution metrics from audit runs
 */
export function calculateDistribution(runs: AuditRun[]): DistributionMetrics {
  if (runs.length === 0) {
    throw new Error('Cannot calculate distribution from empty runs array');
  }

  const scores = runs.map(r => r.overall_score).sort((a, b) => a - b);
  const n = scores.length;
  
  // Mean
  const mean = scores.reduce((sum, score) => sum + score, 0) / n;
  
  // Variance and standard deviation
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / (n - 1);
  const stddev = Math.sqrt(variance);
  
  // Min and max
  const min = scores[0];
  const max = scores[n - 1];
  
  // Quantiles using linear interpolation
  const quantile = (p: number): number => {
    if (p <= 0) return scores[0];
    if (p >= 1) return scores[n - 1];
    const index = (n - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return scores[lower] * (1 - weight) + scores[upper] * weight;
  };
  
  return {
    mean,
    stddev,
    variance,
    min,
    max,
    quantiles: {
      p5: quantile(0.05),
      p25: quantile(0.25),
      p50: quantile(0.50), // median
      p75: quantile(0.75),
      p95: quantile(0.95),
    },
    count: n
  };
}

/**
 * Calculate confidence interval using bootstrap method
 */
export function calculateConfidenceInterval(
  scores: number[],
  level: number = 0.95,
  bootstrapSamples: number = 1000
): ConfidenceInterval {
  if (scores.length === 0) {
    throw new Error('Cannot calculate confidence interval from empty scores array');
  }

  if (scores.length === 1) {
    // Single score - return point estimate with zero-width interval
    return {
      lower: scores[0],
      upper: scores[0],
      level,
      method: 'bootstrap'
    };
  }

  // Bootstrap sampling
  const bootstrapMeans: number[] = [];
  const n = scores.length;
  
  for (let i = 0; i < bootstrapSamples; i++) {
    const sample: number[] = [];
    for (let j = 0; j < n; j++) {
      const randomIndex = Math.floor(Math.random() * n);
      sample.push(scores[randomIndex]);
    }
    const sampleMean = sample.reduce((sum, s) => sum + s, 0) / n;
    bootstrapMeans.push(sampleMean);
  }
  
  // Sort bootstrap means
  bootstrapMeans.sort((a, b) => a - b);
  
  // Calculate percentiles
  const alpha = 1 - level;
  const lowerPercentile = alpha / 2;
  const upperPercentile = 1 - alpha / 2;
  
  const lowerIndex = Math.floor(bootstrapMeans.length * lowerPercentile);
  const upperIndex = Math.floor(bootstrapMeans.length * upperPercentile);
  
  return {
    lower: bootstrapMeans[lowerIndex],
    upper: bootstrapMeans[upperIndex],
    level,
    method: 'bootstrap'
  };
}

/**
 * BCa (Bias-Corrected Accelerated) Bootstrap Confidence Intervals
 * More accurate than percentile bootstrap, especially for skewed distributions
 * Minimum 1,000 samples recommended per research requirements
 */
export interface BCaConfidenceInterval extends ConfidenceInterval {
  bias: number;
  acceleration: number;
  method: 'bca';
}

export function calculateBCaConfidenceInterval(
  scores: number[],
  level: number = 0.95,
  bootstrapSamples: number = 1000
): BCaConfidenceInterval {
  if (scores.length === 0) {
    throw new Error('Cannot calculate BCa CI from empty scores array');
  }

  if (scores.length === 1) {
    return {
      lower: scores[0],
      upper: scores[0],
      level,
      method: 'bca',
      bias: 0,
      acceleration: 0
    };
  }

  // Ensure minimum sample size
  const n = scores.length;
  const actualBootstrapSamples = Math.max(bootstrapSamples, 1000);
  
  // Calculate original statistic (mean)
  const originalMean = calculateMean(scores);
  
  // Bootstrap sampling
  const bootstrapMeans: number[] = [];
  for (let i = 0; i < actualBootstrapSamples; i++) {
    const sample: number[] = [];
    for (let j = 0; j < n; j++) {
      const randomIndex = Math.floor(Math.random() * n);
      sample.push(scores[randomIndex]);
    }
    const sampleMean = calculateMean(sample);
    bootstrapMeans.push(sampleMean);
  }
  
  // Sort bootstrap means
  bootstrapMeans.sort((a, b) => a - b);
  
  // Calculate bias correction (z0)
  const bias = calculateBiasCorrection(bootstrapMeans, originalMean);
  
  // Calculate acceleration (a)
  const acceleration = calculateAcceleration(scores, originalMean);
  
  // Calculate adjusted percentiles
  const alpha = 1 - level;
  const lowerAlpha = alpha / 2;
  const upperAlpha = 1 - alpha / 2;
  
  const lowerPercentile = calculateBCaPercentile(lowerAlpha, bias, acceleration);
  const upperPercentile = calculateBCaPercentile(upperAlpha, bias, acceleration);
  
  // Clamp percentiles to [0, 1]
  const lowerPercentileClamped = Math.max(0, Math.min(1, lowerPercentile));
  const upperPercentileClamped = Math.max(0, Math.min(1, upperPercentile));
  
  const lowerIndex = Math.floor(bootstrapMeans.length * lowerPercentileClamped);
  const upperIndex = Math.floor(bootstrapMeans.length * upperPercentileClamped);
  
  return {
    lower: bootstrapMeans[lowerIndex],
    upper: bootstrapMeans[upperIndex],
    level,
    method: 'bca',
    bias,
    acceleration
  };
}

/**
 * Calculate bias correction factor (z0)
 */
function calculateBiasCorrection(bootstrapMeans: number[], originalMean: number): number {
  const n = bootstrapMeans.length;
  const countBelow = bootstrapMeans.filter(m => m < originalMean).length;
  const proportion = countBelow / n;
  
  // z0 = Φ^(-1)(proportion), where Φ is the standard normal CDF
  // Approximation using inverse normal CDF
  return inverseNormalCDF(proportion);
}

/**
 * Calculate acceleration factor (a)
 * Uses jackknife estimate
 */
function calculateAcceleration(scores: number[], originalMean: number): number {
  const n = scores.length;
  
  // Calculate jackknife means (leave-one-out)
  const jackknifeMeans: number[] = [];
  for (let i = 0; i < n; i++) {
    const jackknifeSample = scores.filter((_, idx) => idx !== i);
    jackknifeMeans.push(calculateMean(jackknifeSample));
  }
  
  const jackknifeMean = calculateMean(jackknifeMeans);
  
  // Calculate acceleration
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < n; i++) {
    const diff = jackknifeMean - jackknifeMeans[i];
    numerator += Math.pow(diff, 3);
    denominator += Math.pow(diff, 2);
  }
  
  if (denominator === 0) {
    return 0;
  }
  
  return numerator / (6 * Math.pow(denominator, 1.5));
}

/**
 * Calculate BCa-adjusted percentile
 */
function calculateBCaPercentile(alpha: number, bias: number, acceleration: number): number {
  // BCa formula: α_BCa = Φ(z0 + (z0 + z_α) / (1 - a(z0 + z_α)))
  const zAlpha = inverseNormalCDF(alpha);
  const denominator = 1 - acceleration * (bias + zAlpha);
  
  if (Math.abs(denominator) < 1e-10) {
    // Avoid division by zero
    return alpha;
  }
  
  const adjustedZ = bias + (bias + zAlpha) / denominator;
  return normalCDF(adjustedZ);
}

/**
 * Approximate inverse normal CDF (quantile function)
 * Using Beasley-Springer-Moro algorithm approximation
 */
function inverseNormalCDF(p: number): number {
  // Clamp to valid range
  p = Math.max(0.0001, Math.min(0.9999, p));
  
  // Approximation for standard normal quantile
  const a0 = 2.50662823884;
  const a1 = -18.61500062529;
  const a2 = 41.39119773534;
  const a3 = -25.44106049637;
  const b1 = -8.47351093090;
  const b2 = 23.08336743743;
  const b3 = -21.06224101826;
  const b4 = 3.13082909833;
  const c0 = -2.78718931138;
  const c1 = -2.29796479134;
  const c2 = 4.85014127135;
  const c3 = 2.32121276858;
  const d1 = 3.54388924762;
  const d2 = 1.63706781897;
  
  let r: number;
  if (p > 0.5) {
    r = Math.sqrt(-Math.log(1 - p));
    return ((c3 + r * (c2 + r * (c1 + r * c0))) / (1 + r * (d1 + r * d2)));
  } else {
    r = Math.sqrt(-Math.log(p));
    return -((c3 + r * (c2 + r * (c1 + r * c0))) / (1 + r * (d1 + r * d2)));
  }
}

/**
 * Approximate normal CDF
 * Using error function approximation
 */
function normalCDF(z: number): number {
  // Approximation using error function: Φ(z) = 0.5 * (1 + erf(z/√2))
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

/**
 * Error function approximation
 */
function erf(x: number): number {
  // Abramowitz and Stegun approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return sign * y;
}

/**
 * Calculate calibration metrics (precision, recall, F1) vs ground truth
 */
export function calculateCalibrationMetrics(
  predictions: number[],
  groundTruth: boolean[],
  threshold: number = 0.5
): CalibrationMetrics {
  if (predictions.length !== groundTruth.length) {
    throw new Error('Predictions and ground truth arrays must have the same length');
  }

  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (let i = 0; i < predictions.length; i++) {
    const predicted = predictions[i] >= threshold;
    const actual = groundTruth[i];

    if (predicted && actual) {
      truePositives++;
    } else if (predicted && !actual) {
      falsePositives++;
    } else if (!predicted && actual) {
      falseNegatives++;
    } else {
      trueNegatives++;
    }
  }

  const precision = (truePositives + falsePositives) > 0
    ? truePositives / (truePositives + falsePositives)
    : 0;
  
  const recall = (truePositives + falseNegatives) > 0
    ? truePositives / (truePositives + falseNegatives)
    : 0;
  
  const f1 = (precision + recall) > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0;
  
  const specificity = (trueNegatives + falsePositives) > 0
    ? trueNegatives / (trueNegatives + falsePositives)
    : 0;
  
  const accuracy = (truePositives + trueNegatives + falsePositives + falseNegatives) > 0
    ? (truePositives + trueNegatives) / (truePositives + trueNegatives + falsePositives + falseNegatives)
    : 0;

  return {
    precision,
    recall,
    f1,
    specificity,
    accuracy,
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives
  };
}

/**
 * Calculate inter-rater agreement using Cohen's Kappa
 */
export function calculateInterRaterAgreement(labels: LabelSet[]): number {
  if (labels.length === 0) {
    return 0;
  }

  // For simplicity, calculate pairwise agreement
  // If we have multiple annotators per conversation, calculate average pairwise kappa
  const agreements: number[] = [];
  
  // Group by conversation_id
  const byConversation = new Map<string, LabelSet>();
  labels.forEach(label => {
    byConversation.set(label.conversation_id, label);
  });

  // Calculate pairwise agreement for conversations with multiple annotators
  for (const [conversationId, labelSet] of byConversation.entries()) {
    const annotators = labelSet.labels;
    if (annotators.length < 2) continue;

    // Calculate pairwise kappa for all pairs
    for (let i = 0; i < annotators.length; i++) {
      for (let j = i + 1; j < annotators.length; j++) {
        const a1 = annotators[i];
        const a2 = annotators[j];
        
        // Simple agreement: both say manipulation or both say no manipulation
        const agree = a1.is_manipulation === a2.is_manipulation;
        agreements.push(agree ? 1 : 0);
      }
    }
  }

  if (agreements.length === 0) {
    // No pairwise comparisons, return 0
    return 0;
  }

  // Return average agreement (simplified kappa)
  const avgAgreement = agreements.reduce((sum, a) => sum + a, 0) / agreements.length;
  
  // For Cohen's kappa, we need observed agreement and expected agreement
  // Simplified version: return observed agreement
  // Full kappa = (Po - Pe) / (1 - Pe) where Po is observed agreement, Pe is expected
  return avgAgreement;
}

/**
 * Calculate sensitivity to prompt distribution shift
 * Compares scores across different prompt variations or model versions
 */
export function calculateSensitivity(
  baselineScores: number[],
  shiftedScores: number[]
): {
  meanShift: number;
  stddevShift: number;
  effectSize: number; // Cohen's d
  significant: boolean; // Simple heuristic based on effect size
} {
  if (baselineScores.length === 0 || shiftedScores.length === 0) {
    throw new Error('Both score arrays must be non-empty');
  }

  const baselineMean = baselineScores.reduce((sum, s) => sum + s, 0) / baselineScores.length;
  const shiftedMean = shiftedScores.reduce((sum, s) => sum + s, 0) / shiftedScores.length;
  
  const baselineVariance = baselineScores.reduce((sum, s) => sum + Math.pow(s - baselineMean, 2), 0) / (baselineScores.length - 1);
  const shiftedVariance = shiftedScores.reduce((sum, s) => sum + Math.pow(s - shiftedMean, 2), 0) / (shiftedScores.length - 1);
  
  const pooledStddev = Math.sqrt((baselineVariance + shiftedVariance) / 2);
  
  const meanShift = shiftedMean - baselineMean;
  const stddevShift = Math.sqrt(shiftedVariance) - Math.sqrt(baselineVariance);
  const effectSize = pooledStddev > 0 ? meanShift / pooledStddev : 0;
  
  // Consider significant if effect size > 0.5 (medium effect)
  const significant = Math.abs(effectSize) > 0.5;

  return {
    meanShift,
    stddevShift,
    effectSize,
    significant
  };
}

/**
 * Robust statistics: Median Absolute Deviation (MAD)
 */
export function calculateMAD(scores: number[]): number {
  if (scores.length === 0) {
    throw new Error('Cannot calculate MAD from empty scores array');
  }
  
  const median = calculateMedian(scores);
  const deviations = scores.map(s => Math.abs(s - median));
  return calculateMedian(deviations);
}

/**
 * Calculate median
 */
function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  if (n % 2 === 0) {
    return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  } else {
    return sorted[Math.floor(n / 2)];
  }
}

/**
 * Trimmed mean (remove top and bottom percentiles)
 */
export function calculateTrimmedMean(
  scores: number[],
  trimPercent: number = 0.1
): number {
  if (scores.length === 0) {
    throw new Error('Cannot calculate trimmed mean from empty scores array');
  }
  
  const sorted = [...scores].sort((a, b) => a - b);
  const trimCount = Math.floor(scores.length * trimPercent);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  
  if (trimmed.length === 0) {
    return calculateMean(scores);
  }
  
  return calculateMean(trimmed);
}

/**
 * Winsorized mean (replace extreme values with percentiles)
 */
export function calculateWinsorizedMean(
  scores: number[],
  winsorizePercent: number = 0.1
): number {
  if (scores.length === 0) {
    throw new Error('Cannot calculate winsorized mean from empty scores array');
  }
  
  const sorted = [...scores].sort((a, b) => a - b);
  const winsorizeCount = Math.floor(scores.length * winsorizePercent);
  
  const lowerBound = sorted[winsorizeCount];
  const upperBound = sorted[sorted.length - winsorizeCount - 1];
  
  const winsorized = scores.map(s => {
    if (s < lowerBound) return lowerBound;
    if (s > upperBound) return upperBound;
    return s;
  });
  
  return calculateMean(winsorized);
}

/**
 * Calculate mean
 */
function calculateMean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Variance decomposition: Separate variance into components
 * (temperature effect, seed effect, residual)
 */
export interface VarianceDecomposition {
  totalVariance: number;
  temperatureVariance: number;
  seedVariance: number;
  residualVariance: number;
  temperaturePercent: number;
  seedPercent: number;
  residualPercent: number;
}

export function decomposeVariance(
  reports: Array<{
    temperature?: number;
    seed?: number;
    score: number;
  }>
): VarianceDecomposition {
  if (reports.length === 0) {
    throw new Error('Cannot decompose variance from empty reports');
  }
  
  const scores = reports.map(r => r.score);
  const totalMean = calculateMean(scores);
  const totalVariance = scores.reduce((sum, s) => sum + Math.pow(s - totalMean, 2), 0) / (scores.length - 1);
  
  // Group by temperature
  const tempGroups = new Map<number, number[]>();
  for (const report of reports) {
    if (report.temperature !== undefined) {
      const key = Math.round(report.temperature * 10) / 10; // Round to 0.1
      if (!tempGroups.has(key)) {
        tempGroups.set(key, []);
      }
      tempGroups.get(key)!.push(report.score);
    }
  }
  
  // Calculate temperature variance (between-group variance)
  let temperatureVariance = 0;
  if (tempGroups.size > 1) {
    const tempMeans = Array.from(tempGroups.values()).map(group => calculateMean(group));
    const overallTempMean = calculateMean(tempMeans);
    temperatureVariance = tempMeans.reduce((sum, m) => sum + Math.pow(m - overallTempMean, 2), 0) / (tempMeans.length - 1);
  }
  
  // Group by seed
  const seedGroups = new Map<number, number[]>();
  for (const report of reports) {
    if (report.seed !== undefined) {
      if (!seedGroups.has(report.seed)) {
        seedGroups.set(report.seed, []);
      }
      seedGroups.get(report.seed)!.push(report.score);
    }
  }
  
  // Calculate seed variance
  let seedVariance = 0;
  if (seedGroups.size > 1) {
    const seedMeans = Array.from(seedGroups.values()).map(group => calculateMean(group));
    const overallSeedMean = calculateMean(seedMeans);
    seedVariance = seedMeans.reduce((sum, m) => sum + Math.pow(m - overallSeedMean, 2), 0) / (seedMeans.length - 1);
  }
  
  // Residual variance (what's left after accounting for temperature and seed)
  const residualVariance = Math.max(0, totalVariance - temperatureVariance - seedVariance);
  
  return {
    totalVariance,
    temperatureVariance,
    seedVariance,
    residualVariance,
    temperaturePercent: totalVariance > 0 ? (temperatureVariance / totalVariance) * 100 : 0,
    seedPercent: totalVariance > 0 ? (seedVariance / totalVariance) * 100 : 0,
    residualPercent: totalVariance > 0 ? (residualVariance / totalVariance) * 100 : 0
  };
}

/**
 * Inter-judge reliability: Intraclass Correlation Coefficient (ICC)
 */
export interface ICCResult {
  icc: number;
  interpretation: 'poor' | 'fair' | 'good' | 'excellent';
  confidenceInterval?: ConfidenceInterval;
}

export function calculateIntraJudgeReliability(
  judges: Array<{
    judgeId: string;
    scores: number[];
  }>
): ICCResult {
  if (judges.length < 2) {
    throw new Error('Need at least 2 judges to calculate ICC');
  }
  
  // Ensure all judges have same number of scores
  const nScores = judges[0].scores.length;
  if (!judges.every(j => j.scores.length === nScores)) {
    throw new Error('All judges must have the same number of scores');
  }
  
  // Calculate ICC (simplified version - one-way random effects)
  const allScores: number[] = [];
  for (let i = 0; i < nScores; i++) {
    for (const judge of judges) {
      allScores.push(judge.scores[i]);
    }
  }
  
  const grandMean = calculateMean(allScores);
  
  // Between-judge variance
  const judgeMeans = judges.map(j => calculateMean(j.scores));
  const betweenJudgeVariance = judgeMeans.reduce((sum, m) => sum + Math.pow(m - grandMean, 2), 0) / (judges.length - 1);
  
  // Within-judge variance
  let withinJudgeVariance = 0;
  for (const judge of judges) {
    const judgeMean = calculateMean(judge.scores);
    const variance = judge.scores.reduce((sum, s) => sum + Math.pow(s - judgeMean, 2), 0) / (judge.scores.length - 1);
    withinJudgeVariance += variance;
  }
  withinJudgeVariance /= judges.length;
  
  // ICC = between-judge variance / (between-judge variance + within-judge variance)
  const icc = (betweenJudgeVariance + withinJudgeVariance) > 0
    ? betweenJudgeVariance / (betweenJudgeVariance + withinJudgeVariance)
    : 0;
  
  let interpretation: 'poor' | 'fair' | 'good' | 'excellent';
  if (icc < 0.4) {
    interpretation = 'poor';
  } else if (icc < 0.6) {
    interpretation = 'fair';
  } else if (icc < 0.75) {
    interpretation = 'good';
  } else {
    interpretation = 'excellent';
  }
  
  return {
    icc,
    interpretation
  };
}

/**
 * Cluster bootstrap confidence intervals
 * Resample at cluster level (e.g., conversation_id or audit_id)
 */
export function calculateClusterBootstrapCI(
  clusters: Array<{
    clusterId: string;
    scores: number[];
  }>,
  level: number = 0.95,
  bootstrapSamples: number = 1000
): ConfidenceInterval {
  if (clusters.length === 0) {
    throw new Error('Cannot calculate cluster bootstrap CI from empty clusters');
  }
  
  // Calculate cluster means
  const clusterMeans = clusters.map(c => calculateMean(c.scores));
  const overallMean = calculateMean(clusterMeans);
  
  // Bootstrap: resample clusters (not individual scores)
  const bootstrapMeans: number[] = [];
  const nClusters = clusters.length;
  
  for (let i = 0; i < bootstrapSamples; i++) {
    const resampledClusters: number[] = [];
    for (let j = 0; j < nClusters; j++) {
      const randomIndex = Math.floor(Math.random() * nClusters);
      resampledClusters.push(clusterMeans[randomIndex]);
    }
    const sampleMean = calculateMean(resampledClusters);
    bootstrapMeans.push(sampleMean);
  }
  
  // Sort bootstrap means
  bootstrapMeans.sort((a, b) => a - b);
  
  // Calculate percentiles
  const alpha = 1 - level;
  const lowerPercentile = alpha / 2;
  const upperPercentile = 1 - alpha / 2;
  
  const lowerIndex = Math.floor(bootstrapMeans.length * lowerPercentile);
  const upperIndex = Math.floor(bootstrapMeans.length * upperPercentile);
  
  return {
    lower: bootstrapMeans[lowerIndex],
    upper: bootstrapMeans[upperIndex],
    level,
    method: 'bootstrap'
  };
}

/**
 * Robust statistics summary
 */
export interface RobustStatistics {
  median: number;
  mad: number;
  trimmedMean: number;
  winsorizedMean: number;
  iqr: number; // Interquartile range
}

export function calculateRobustStatistics(scores: number[]): RobustStatistics {
  if (scores.length === 0) {
    throw new Error('Cannot calculate robust statistics from empty scores array');
  }
  
  const sorted = [...scores].sort((a, b) => a - b);
  const median = calculateMedian(sorted);
  const mad = calculateMAD(sorted);
  const trimmedMean = calculateTrimmedMean(sorted);
  const winsorizedMean = calculateWinsorizedMean(sorted);
  
  // IQR = Q3 - Q1
  const q1 = calculateQuantile(sorted, 0.25);
  const q3 = calculateQuantile(sorted, 0.75);
  const iqr = q3 - q1;
  
  return {
    median,
    mad,
    trimmedMean,
    winsorizedMean,
    iqr
  };
}

/**
 * Calculate quantile
 */
function calculateQuantile(sorted: number[], p: number): number {
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[sorted.length - 1];
  
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

