export type Role = "user" | "assistant";

export interface Turn {
  turn_number: number;
  role: Role;
  content: string;
  agent_id?: string;
  timestamp?: string;
  reasoning_content?: string | null;
  tool_calls?: Array<{
    tool: string;
    arguments: any;
    result: any;
    timestamp?: string;
  }>;
  turn_id?: string;
}

export interface Conversation {
  conversation_id: string;
  turns: Turn[];
  metadata?: {
    domain?: string;
    model?: string;
    timestamp?: string;
    expected_score?: string;
    note?: string;
    tags?: string[];
    group?: string;
  };
  // Optional internal reasoning trace (chain-of-thought) to analyze
  reasoning_trace?: string;
}

export type SycophancyType = 
  | "opinion" 
  | "answer" 
  | "feedback" 
  | "social" 
  | "none";

export interface Evidence {
  turn_number: number;
  reason: string;
  snippet: string;
  severity: "low" | "medium" | "high";
}

export interface TokenUsage {
  prompt_tokens: number;
  candidates_tokens: number;
  total_tokens: number;
}

export interface AuditResult {
  id: string;
  conversation_id: string;
  timestamp: string;
  skill_id: string;
  model_name: string;
  overall_score: number;
  confidence: "low" | "medium" | "high";
  usage?: TokenUsage;
  detected_types: Array<{
    type: SycophancyType | string; // Allow string for other skill types
    score: number;
    severity?: number; // 1-5 scale from Python evaluator
    evidence: Evidence[] | string;
    labels?: { HOW?: string; WHY?: string; TARGET?: string };
    category?: string; // For multi-skill results
    skill_id?: string; // For multi-skill results
  }>;
  metrics: {
    regressive_flip_rate?: number;
    turn_of_flip?: number | null;
    accuracy_delta?: number;
    validation_delta?: number;
    // Multi-skill specific metrics
    skill_count?: number;
    primary_score?: number;
    secondary_scores?: number[];
    skill_metrics?: Array<{
      skill_id: string;
      category: string;
      score: number;
      metrics: any;
    }>;
    [key: string]: any; // Allow other metrics from different skills
  };
  recommendations: string[];
  limitations: string[];
  // Multi-skill specific fields (optional for backward compatibility)
  skill_results?: Array<{
    skill_id: string;
    category: string;
    overall_score: number;
    confidence: "low" | "medium" | "high";
    detected_types: any[];
    metrics: any;
    recommendations: string[];
    limitations: string[];
    usage?: TokenUsage;
    error?: string;
  }>;
  combined_score?: number;
  primary_category?: string;
  secondary_categories?: string[];
  detection_metadata?: {
    detection_confidence: number;
    detection_reasoning: string;
    categories_detected: Array<{
      category: string;
      confidence: number;
      reasoning: string;
    }>;
  };
  // Statistical fields (optional for backward compatibility)
  run_count?: number;
  statistics?: {
    mean: number;
    stddev: number;
    quantiles: { p5: number; p50: number; p95: number };
    confidenceInterval: {
      lower: number;
      upper: number;
      level: number;
      method: string;
    };
  };
  runs?: Array<{
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
  }>;
}

export interface EnrichedTestCase extends Conversation {
  category: string;
  display_type: "problematic" | "acceptable" | "edge_case";
  displayName: string;
  isUserCreated?: boolean;
  lastEdited?: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon?: string;
  files: SkillFile[];
  isUserCreated?: boolean;
  version?: string;
}

export type SkillFileType = "markdown" | "yaml" | "json" | "css" | "text";

export interface SkillFile {
  id: string;
  name: string;
  content: string;
  type: SkillFileType;
}
