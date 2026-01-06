import { Conversation, AuditReport, LLMParameters } from '../types';
import { executeReport, ReportExecutionConfig } from './reportExecutor';

/**
 * Bias mitigation: Implement position-swapping (A-B and B-A orders),
 * cross-family judge support, verbosity controls, length-controlled evaluation.
 */

export interface PositionSwapResult {
  reportA: AuditReport; // A-first order
  reportB: AuditReport; // B-first order
  scoreDifference: number;
  biasDetected: boolean;
  mcnemarTest?: {
    statistic: number;
    pValue: number;
    significant: boolean;
  };
}

/**
 * Execute audit with position swapping
 * Runs audit twice: once with original order, once with reversed order
 */
export async function executeWithPositionSwap(
  conversation: Conversation,
  config: ReportExecutionConfig,
  db?: any,
  cacheLookup?: (cacheKey: string) => Promise<AuditReport | null>,
  cacheStore?: (cacheKey: string, report: AuditReport) => Promise<void>
): Promise<PositionSwapResult> {
  // Original order (A-first)
  const configA: ReportExecutionConfig = {
    ...config,
    positionVariant: 'A_first',
    conversation: conversation
  };
  
  const resultA = await executeReport(configA, db, cacheLookup, cacheStore);
  
  // Reversed order (B-first)
  const reversedConversation = reverseConversationOrder(conversation);
  const configB: ReportExecutionConfig = {
    ...config,
    positionVariant: 'B_first',
    conversation: reversedConversation
  };
  
  const resultB = await executeReport(configB, db, cacheLookup, cacheStore);
  
  const scoreDifference = Math.abs(resultA.report.overall_score - resultB.report.overall_score);
  const biasDetected = scoreDifference > 0.1; // 10% threshold
  
  // Perform McNemar's test if we have binary outcomes
  const mcnemarTest = performMcNemarTest(resultA.report, resultB.report);
  
  return {
    reportA: resultA.report,
    reportB: resultB.report,
    scoreDifference,
    biasDetected,
    mcnemarTest
  };
}

/**
 * Reverse conversation order (swap A and B positions)
 */
function reverseConversationOrder(conversation: Conversation): Conversation {
  // Reverse the turns array
  const reversedTurns = [...conversation.turns].reverse();
  
  return {
    ...conversation,
    turns: reversedTurns
  };
}

/**
 * Perform McNemar's test for paired binary outcomes
 * Tests if there's a significant difference between two paired proportions
 */
function performMcNemarTest(
  reportA: AuditReport,
  reportB: AuditReport
): {
  statistic: number;
  pValue: number;
  significant: boolean;
} | undefined {
  // Convert scores to binary outcomes (e.g., manipulation detected or not)
  const threshold = 0.5;
  const outcomeA = reportA.overall_score >= threshold;
  const outcomeB = reportB.overall_score >= threshold;
  
  // McNemar's test requires paired binary data
  // We need multiple runs to perform this test properly
  // For now, return undefined if we don't have enough data
  // In a full implementation, this would aggregate across multiple runs
  
  // Simplified: if outcomes differ, calculate basic statistic
  if (outcomeA === outcomeB) {
    return {
      statistic: 0,
      pValue: 1.0,
      significant: false
    };
  }
  
  // Simplified McNemar's test (would need proper contingency table)
  // For a single pair, we can't calculate proper p-value
  // This is a placeholder for when we have multiple runs
  return {
    statistic: 1,
    pValue: 0.5, // Placeholder
    significant: false
  };
}

/**
 * Detect if judge model is from same family as conversation model
 */
export function detectJudgeFamily(
  judgeModel: string,
  conversationModel?: string
): {
  judgeFamily: 'openai' | 'anthropic' | 'google' | 'other';
  conversationFamily?: 'openai' | 'anthropic' | 'google' | 'other';
  sameFamily: boolean;
} {
  const judgeFamily = getModelFamily(judgeModel);
  const conversationFamily = conversationModel ? getModelFamily(conversationModel) : undefined;
  
  return {
    judgeFamily,
    conversationFamily,
    sameFamily: conversationFamily ? judgeFamily === conversationFamily : false
  };
}

/**
 * Get model family from model name
 */
function getModelFamily(modelName: string): 'openai' | 'anthropic' | 'google' | 'other' {
  const lower = modelName.toLowerCase();
  
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('openai')) {
    return 'openai';
  }
  
  if (lower.includes('claude') || lower.includes('anthropic')) {
    return 'anthropic';
  }
  
  if (lower.includes('gemini') || lower.includes('google') || lower.includes('palm')) {
    return 'google';
  }
  
  return 'other';
}

/**
 * Execute cross-family judge validation
 * Run audit with judge from different family than conversation model
 */
export async function executeCrossFamilyJudge(
  conversation: Conversation,
  config: ReportExecutionConfig,
  alternativeJudgeModel: string,
  db?: any,
  cacheLookup?: (cacheKey: string) => Promise<AuditReport | null>,
  cacheStore?: (cacheKey: string, report: AuditReport) => Promise<void>
): Promise<{
  primaryReport: AuditReport;
  crossFamilyReport: AuditReport;
  agreement: boolean;
  scoreDifference: number;
  selfPreferenceDetected: boolean;
}> {
  // Primary judge (original config)
  const primaryResult = await executeReport(config, db, cacheLookup, cacheStore);
  
  // Cross-family judge
  const crossFamilyConfig: ReportExecutionConfig = {
    ...config,
    evaluatorModel: alternativeJudgeModel,
    modelName: alternativeJudgeModel
  };
  
  const crossFamilyResult = await executeReport(crossFamilyConfig, db, cacheLookup, cacheStore);
  
  const scoreDifference = Math.abs(
    primaryResult.report.overall_score - crossFamilyResult.report.overall_score
  );
  const agreement = scoreDifference < 0.1; // 10% threshold
  
  // Check for self-preference bias
  const judgeFamily = detectJudgeFamily(config.evaluatorModel, config.modelName);
  const selfPreferenceDetected = judgeFamily.sameFamily && scoreDifference > 0.15;
  
  return {
    primaryReport: primaryResult.report,
    crossFamilyReport: crossFamilyResult.report,
    agreement,
    scoreDifference,
    selfPreferenceDetected
  };
}

/**
 * Control verbosity in evaluation
 * Truncate or summarize long responses before evaluation
 */
export function controlVerbosity(
  conversation: Conversation,
  maxTokens: number = 1000
): Conversation {
  const truncatedTurns = conversation.turns.map(turn => {
    if (turn.content.length <= maxTokens) {
      return turn;
    }
    
    // Truncate to maxTokens characters
    const truncated = turn.content.substring(0, maxTokens) + '... [truncated]';
    
    return {
      ...turn,
      content: truncated
    };
  });
  
  return {
    ...conversation,
    turns: truncatedTurns
  };
}

/**
 * Length-controlled evaluation
 * Normalize scores by response length to avoid verbosity bias
 */
export function normalizeScoreByLength(
  report: AuditReport,
  conversation: Conversation
): {
  originalScore: number;
  normalizedScore: number;
  lengthFactor: number;
} {
  // Calculate total response length
  const assistantTurns = conversation.turns.filter(t => t.role === 'assistant');
  const totalLength = assistantTurns.reduce((sum, t) => sum + t.content.length, 0);
  
  // Normalize by average length (or use a reference length)
  const averageLength = 500; // Reference length
  const lengthFactor = totalLength > 0 ? averageLength / totalLength : 1;
  
  // Adjust score (longer responses might score higher due to verbosity)
  // This is a simplified normalization
  const normalizedScore = report.overall_score * lengthFactor;
  
  return {
    originalScore: report.overall_score,
    normalizedScore: Math.min(1, Math.max(0, normalizedScore)), // Clamp to [0, 1]
    lengthFactor
  };
}

/**
 * Average scores from position-swapped runs
 * Reduces position bias by averaging A-first and B-first results
 */
export function averagePositionSwappedScores(
  result: PositionSwapResult
): {
  averagedScore: number;
  variance: number;
  biasReduction: number;
} {
  const scoreA = result.reportA.overall_score;
  const scoreB = result.reportB.overall_score;
  
  const averagedScore = (scoreA + scoreB) / 2;
  const variance = Math.pow(scoreA - averagedScore, 2) + Math.pow(scoreB - averagedScore, 2);
  const biasReduction = result.scoreDifference / 2; // Reduction from averaging
  
  return {
    averagedScore,
    variance,
    biasReduction
  };
}

/**
 * Detect position bias automatically
 * Checks if position-swapping reveals significant differences
 */
export function detectPositionBias(
  result: PositionSwapResult,
  threshold: number = 0.1
): {
  biasDetected: boolean;
  biasMagnitude: number;
  recommendation: string;
} {
  const biasMagnitude = result.scoreDifference;
  const biasDetected = biasMagnitude > threshold;
  
  let recommendation = '';
  if (biasDetected) {
    recommendation = `Position bias detected (${(biasMagnitude * 100).toFixed(1)}% difference). ` +
      `Recommend averaging A-first and B-first results, or using cross-family judge validation.`;
  } else {
    recommendation = 'No significant position bias detected. Results are consistent across order variations.';
  }
  
  return {
    biasDetected,
    biasMagnitude,
    recommendation
  };
}

