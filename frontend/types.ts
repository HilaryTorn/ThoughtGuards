
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
export type AppView = 'dashboard' | 'traces' | 'settings' | 'audit';

export interface AppSettings {
  categories: Record<DetectionCategory, boolean>;
  sensitivity: 'low' | 'medium' | 'high';
  riskThreshold: number;
  activeSkills: Record<DetectionCategory, string>; // Maps category to skill ID
  auditorModel: string; // Model to use for auditing
  thinkingBudget?: number; // Thinking budget for reasoning models (optional)
  includeValidatorCoT: boolean; // Whether to include chain of thought from validator
}
