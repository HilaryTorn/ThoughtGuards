
export type DetectionCategory = 
  | 'Goal Reasoning'
  | 'Deception Planning'
  | 'Reward Hacking'
  | 'Sabotage Planning'
  | 'Obfuscation & Evasion'
  | 'Persona Manipulation';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  reasoning_trace?: string; // Chain-of-thought reasoning from the assistant
}

export interface DetectionEvent {
  id: string;
  category: DetectionCategory;
  riskScore: number;
  timestamp: string;
  snippet: string;
  fullCoT: string;
  conversationHistory: Message[]; 
  matchedPatterns: string[];
  confidence: {
    model: number;
    heuristic: number;
  };
}

export type TraceStatus = 'clean' | 'flagged' | 'review' | 'confirmed' | 'false_positive' | 'reviewed';

export interface Trace {
  id: string;
  timestamp: string;
  messageCount: number;
  status: TraceStatus;
  riskScore: number;
  // If flagged, it contains detection details. If clean, this is undefined.
  detectionEvent?: DetectionEvent; 
  // Full conversation is always available
  conversation: Message[]; 
  // Audit metadata (if available from database)
  auditId?: string;
  conversationId?: string;
  skillId?: string;
  modelName?: string;
  overallScore?: number;
  confidence?: string;
  detectedTypes?: Array<{ type: string; score: number; evidence: any[] }>;
  metrics?: any;
  recommendations?: string[];
  limitations?: string[];
  usage?: { prompt_tokens: number; candidates_tokens: number; total_tokens: number };
  // Multi-skill fields (optional for backward compatibility)
  skillResults?: Array<{
    skill_id: string;
    category: string;
    overall_score: number;
    confidence: "low" | "medium" | "high";
    detected_types: any[];
    metrics: any;
    recommendations: string[];
    limitations: string[];
    usage?: { prompt_tokens: number; candidates_tokens: number; total_tokens: number; };
    error?: string;
  }>;
  combinedScore?: number;
  primaryCategory?: string;
  secondaryCategories?: string[];
  detectionMetadata?: {
    detection_confidence: number;
    detection_reasoning: string;
    categories_detected: Array<{
      category: string;
      confidence: number;
      reasoning: string;
    }>;
  };
}

export interface CategoryStyle {
  label: string;
  color: string;
  borderColor: string;
  bgColor: string;
  icon: string;
}

export interface ChartDataPoint {
  time: string;
  count: number;
}

// Renamed views to match new requirements
export type AppView = 'dashboard' | 'traces' | 'settings' | 'audit' | 'chat';

export interface AppSettings {
  categories: Record<DetectionCategory, boolean>;
  // Multi-run statistical analysis settings
  multiRunCount?: number; // Number of runs per audit (default: 1 for single-run)
  multiRunTemperature?: number; // Temperature for variation (optional)
  multiRunSeed?: number; // Seed for reproducibility (optional)
  sensitivity: 'low' | 'medium' | 'high';
  riskThreshold: number;
  activeSkills: Record<DetectionCategory, string>; // Maps category to skill ID
  auditorModel: string; // Model to use for auditing
  thinkingBudget?: number; // Thinking budget for reasoning models (optional)
  includeValidatorCoT: boolean; // Whether to include chain of thought from validator
  chatbotMode?: string; // Chatbot mode for customer chat (helpful, conversion_optimized, retention_focused, metric_gamer)
  // Multi-report system settings
  numRuns?: number; // Number of runs for multi-run audits
  temperature?: number; // Temperature for multi-run audits
  seed?: number; // Seed for multi-run audits
}

// ============================================================================
// Multi-Report Parameter Tracking System Types
// ============================================================================

// LLM Parameters interface - tracks all LLM generation parameters
export interface LLMParameters {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  seed?: number;
  stop_sequences?: string[];
  response_mime_type?: string;
  thinking_budget?: number;
  system_instruction?: string;
  safety_settings?: Record<string, any>;
}

// Audit Report interface (replaces AuditResult for new system)
export interface AuditReport {
  report_id: string;
  conversation_id: string;
  
  // Execution metadata
  created_at: string;
  created_by?: string;
  execution_duration_ms?: number;
  
  // Skill & Model info
  skill_id: string;
  skill_version: string; // Semantic version: "1.2.3"
  model_name: string;
  model_version?: string;
  
  // Full LLM parameters
  llm_parameters: LLMParameters;
  
  // Request metadata
  prompt_hash: string;
  prompt_version: string;
  timestamp_utc: string;
  
  // Response metadata
  system_fingerprint?: string;
  response_hash: string;
  completion_tokens: number;
  prompt_tokens: number;
  cached_tokens?: number;
  latency_ms?: number;
  finish_reason?: string;
  cache_hit: boolean;
  
  // Evaluation metadata
  evaluator_model: string;
  evaluation_seed?: number;
  evaluation_prompt_version?: string;
  
  // Position bias tracking
  position_variant?: 'A_first' | 'B_first';
  
  // vLLM specific
  prompt_patch_id?: string;
  cache_key?: string;
  
  // Results
  overall_score: number;
  confidence: 'low' | 'medium' | 'high';
  detected_types: any[];
  metrics: Record<string, any>;
  recommendations?: string[];
  limitations?: string[];
  usage?: TokenUsage;
  
  // Multi-skill results
  skill_results?: SkillResult[];
  combined_score?: number;
  primary_category?: string;
  secondary_categories?: string[];
  detection_metadata?: DetectionMetadata;
  
  // Full conversation snapshot
  conversation_snapshot: Message[];
  
  // Additional metadata
  tags?: string[];
  notes?: string;
  error_message?: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  candidates_tokens: number;
  total_tokens: number;
}

export interface SkillResult {
  skill_id: string;
  category: string;
  overall_score: number;
  confidence: 'low' | 'medium' | 'high';
  detected_types: any[];
  metrics: Record<string, any>;
  recommendations: string[];
  limitations: string[];
  usage?: TokenUsage;
  error?: string;
}

export interface DetectionMetadata {
  detection_confidence: number;
  detection_reasoning: string;
  categories_detected: Array<{
    category: string;
    confidence: number;
    reasoning: string;
  }>;
}

// Aggregate Report interface
export interface AggregateReport {
  aggregate_id: string;
  conversation_id: string;
  aggregate_type: 'mean' | 'median' | 'parameter_effect' | 'time_series' | 'custom';
  
  source_report_ids: string[];
  source_count: number;
  
  aggregation_config: {
    method: string;
    group_by?: string[];
    filters?: Record<string, any>;
    weight_function?: string;
  };
  
  aggregated_score?: number;
  score_distribution?: DistributionMetrics;
  parameter_effects?: ParameterEffectAnalysis;
  detected_types_aggregated?: any[];
  metrics_aggregated?: Record<string, any>;
  
  created_at: string;
  created_by?: string;
  computation_duration_ms?: number;
  notes?: string;
}

export interface DistributionMetrics {
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

export interface ParameterEffectAnalysis {
  temperature?: ParameterEffect;
  top_p?: ParameterEffect;
  seed?: ParameterEffect;
  interactions?: ParameterInteraction[];
}

export interface ParameterEffect {
  correlation: number;
  effect_size: number;
  p_value?: number;
  samples: number;
}

export interface ParameterInteraction {
  parameters: string[];
  interaction_strength: number;
  p_value?: number;
}

// Parameter Sweep Configuration
export interface ParameterSweepConfig {
  sweep_id?: string;
  conversation_id: string;
  sweep_name: string;
  
  parameters: {
    [key: string]: {
      min?: number;
      max?: number;
      step?: number;
      values?: number[];
    };
  };
  
  skill_id: string;
  model_name: string;
  parallel?: boolean;
  max_concurrent?: number;
  
  // Early stopping
  targetCIWidth?: number;
  targetPrecision?: number;
  adaptiveSampling?: boolean;
  
  // Position swapping for pairwise comparisons
  positionSwap?: boolean;
}

// Skill Version interface
export interface SkillVersion {
  skill_id: string;
  version: string; // Semantic version
  skill_definition: Record<string, any>; // Full skill definition JSON
  changelog?: string;
  created_at: string;
  created_by?: string;
  is_active: boolean;
}

// Run Configuration for multi-run audits
export interface RunConfig {
  count: number;
  seeds?: number[]; // Explicit seeds, or auto-generate
  temperatures?: number[]; // Can sweep temperatures
  minimumForCI?: number; // Default: 30 (BCa breaks down below this)
  targetCIWidth?: number; // Early stop if CI narrow enough
  targetPrecision?: number; // Stop when CI width < this
  positionSwap?: boolean; // For pairwise comparisons
  trackCache?: boolean;
  adaptiveSampling?: boolean; // Add runs until CI stabilizes
  debiasing?: 'none' | 'position_swap' | 'calibration_adjusted';
}

// Statistical Audit Result (extends AuditResult with statistical fields)
export interface StatisticalAuditResult extends AuditReport {
  runs: AuditRun[];
  statistics: {
    n: number;
    mean: number;
    stddev: number;
    sem: number; // Standard error of mean
    quantiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
    confidenceInterval: {
      lower: number;
      upper: number;
      level: number;
      method: 'bootstrap_bca' | 'normal' | 'cluster_bootstrap';
      width: number;
    };
    iqr: number; // Interquartile range
    mad: number; // Median absolute deviation
    robustStats?: {
      trimmedMean: number;
      winsorizedMean: number;
    };
  };
  quality: {
    cacheHitRate: number;
    positionBiasDetected: boolean;
    varianceCategory: 'low' | 'medium' | 'high';
    sufficientSamples: boolean; // Meets minimum N requirements
  };
  biasAdjustment?: {
    rawMean: number;
    adjustedMean: number;
    calibrationN: number;
    specificity: number; // q₀
    sensitivity: number; // q₁
  };
}

export interface AuditRun {
  run_id: string;
  audit_id: string;
  conversation_id: string;
  run_number: number;
  seed?: number;
  temperature?: number;
  model_name: string;
  overall_score: number;
  confidence: 'low' | 'medium' | 'high';
  detected_types?: any[];
  metrics?: Record<string, any>;
  created_at: string;
}

// Drift Alert interface
export interface DriftAlert {
  alertId: string;
  severity: 'warning' | 'critical';
  canaryId: string;
  modelName: string;
  detectedAt: Date;
  baselineValue: number;
  currentValue: number;
  deviation: number; // In standard deviations
  ksStatistic?: number;
  ksPValue?: number;
  psiValue?: number;
  estimatedAffectedAudits: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  mitigationAction?: string;
}

// Calibration Metrics interface
export interface CalibrationMetrics {
  sensitivity: number; // q₁
  specificity: number; // q₀
  sensitivityCI: [number, number];
  specificityCI: [number, number];
  perTypeMetrics: Map<string, {
    sensitivity: number;
    specificity: number;
    sampleSize: number;
  }>;
  hosmerLemeshowPValue: number;
  calibrationSlope: number; // Should be ~1.0
  calibrationIntercept: number; // Should be ~0.0
}

// Calibration Requirements interface
export interface CalibrationRequirements {
  minPerManipulationType: number; // 50 per type
  minTotal: number; // 200
  minForPublicationQuality: number; // 500
  minCohenKappa: number; // 0.7 for safety-critical
  minKrippendorffAlpha: number; // 0.80
  minCalibrationSetForLowVariance: number; // 100
}

// Cluster Balance Analysis
export interface ClusterBalanceAnalysis {
  coefficientOfVariation: number;
  clusterSizes: number[];
  meanSize: number;
  stdDevSize: number;
  recommendation: 'standard' | 'weighted' | 'investigate';
}

// McNemar Result for position bias detection
export interface McNemarResult {
  chiSquared: number;
  pValue: number;
  biasDirection: 'primacy' | 'recency' | 'none';
  biasMagnitude: number;
  effectSize: 'small' | 'medium' | 'large' | 'none';
  warning: boolean;
  critical: boolean;
}

// Variance Decomposition
export interface VarianceDecomposition {
  totalVariance: number;
  temperatureEffect: number;
  seedEffect: number;
  modelEffect?: number;
  residualVariance: number;
  temperatureR2: number;
  seedR2: number;
  modelR2?: number;
  residualR2: number;
}

// Reasoning Analysis for CoT faithfulness
export interface ReasoningAnalysis {
  trace_present: boolean;
  trace_length_tokens?: number;
  provider: 'claude' | 'openai_o' | 'deepseek_r1' | 'other';
  faithfulness_caveat?: string;
  truncation_test?: {
    truncated_answer_differs: boolean;
    suggests_post_hoc: boolean;
  };
}

// Bias-Adjusted Estimate
export interface BiasAdjustedEstimate {
  rawScore: number;
  adjustedScore: number;
  specificity: number; // q₀
  sensitivity: number; // q₁
  calibrationN: number;
  confidenceInterval: [number, number];
  method: 'rogan_gladen';
  edgeCaseHandled: boolean;
  warning?: string;
}

// Sandbagging Detection Result (Tice et al., 2024)
export interface SandbaggingResult {
  conversation_id: string;
  baseline_score: number;
  noisy_score: number;
  score_delta: number;
  sandbagging_detected: boolean;
  confidence: 'low' | 'medium' | 'high';
  noise_type: 'input_perturbation' | 'parameter_variation' | 'temperature_spike';
  noise_level: number;
  baseline_report_id?: string;
  noisy_report_id?: string;
  metadata: {
    baseline_parameters: LLMParameters;
    noisy_parameters: LLMParameters;
    noise_injection_method: string;
    detection_threshold: number;
  };
}

// WMDP Evaluation Result (Li et al., 2024)
export interface WMDPEvaluationResult {
  question_id: string;
  category: string;
  question: string;
  model_response: string;
  is_hazardous: boolean;
  confidence: number;
  evaluation_timestamp: string;
  model_name: string;
  comparison_to_baseline?: {
    baseline_score: number;
    current_score: number;
    delta: number;
  };
}

// Confidence Interval
export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number; // 0.95 for 95% CI
  method: 'bootstrap_bca' | 'normal' | 'cluster_bootstrap' | 'percentile';
  width: number;
}

// Update Trace to reference report_id instead of audit_id
// (Keeping backward compatibility with auditId for now)
export interface Trace {
  id: string;
  timestamp: string;
  messageCount: number;
  status: TraceStatus;
  riskScore: number;
  detectionEvent?: DetectionEvent;
  conversation: Message[];
  // Audit metadata (if available from database)
  auditId?: string; // Deprecated: use reportId
  reportId?: string; // New: reference to audit_reports table
  conversationId?: string;
  skillId?: string;
  modelName?: string;
  overallScore?: number;
  confidence?: string;
  detectedTypes?: Array<{ type: string; score: number; evidence: any[] }>;
  metrics?: any;
  recommendations?: string[];
  limitations?: string[];
  usage?: TokenUsage;
  // Multi-skill fields (optional for backward compatibility)
  skillResults?: SkillResult[];
  combinedScore?: number;
  primaryCategory?: string;
  secondaryCategories?: string[];
  detectionMetadata?: DetectionMetadata;
  // Statistical fields
  runCount?: number;
  scoreMean?: number;
  scoreStddev?: number;
  scoreP5?: number;
  scoreP50?: number;
  scoreP95?: number;
  scoreCiLower?: number;
  scoreCiUpper?: number;
  calibrationMetrics?: CalibrationMetrics;
  statistics?: {
    n: number;
    mean: number;
    stddev: number;
    sem: number;
    quantiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
    confidenceInterval: ConfidenceInterval;
    iqr: number;
    mad: number;
    robustStats?: {
      trimmedMean: number;
      winsorizedMean: number;
    };
  };
}
