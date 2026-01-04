export type Role = "user" | "assistant";

export interface Turn {
  turn_number: number;
  role: Role;
  content: string;
  agent_id?: string;
  timestamp?: string;
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
    type: SycophancyType;
    score: number;
    evidence: Evidence[];
  }>;
  metrics: {
    regressive_flip_rate: number;
    turn_of_flip: number | null;
    accuracy_delta: number;
    validation_delta: number;
  };
  recommendations: string[];
  limitations: string[];
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
