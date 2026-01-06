import { Conversation, AuditReport } from '../types';
import { calculateRobustStatistics } from './statisticalAnalysis';

/**
 * Active learning: Implement uncertainty sampling, boundary case detection,
 * model disagreement tracking, diversity sampling.
 * Store priorities in annotation_priorities table.
 */

export interface AnnotationPriority {
  priority_id: string;
  conversation_id: string;
  priority_score: number; // Higher = label first
  priority_reason: 'high_variance' | 'boundary_case' | 'model_disagreement' | 'high_uncertainty' | 'diversity' | 'random_audit';
  audit_ids?: string[];
  variance_estimate?: number;
  disagreement_magnitude?: number;
  uncertainty_score?: number;
  diversity_score?: number;
}

export interface UncertaintyMetrics {
  least_confidence: number; // 1 - max(probabilities)
  margin: number; // Difference between top 2 probabilities
  entropy: number; // Information entropy
  variance: number; // Score variance across runs
}

/**
 * Calculate uncertainty metrics from audit reports
 */
export function calculateUncertaintyMetrics(
  reports: AuditReport[]
): UncertaintyMetrics {
  if (reports.length === 0) {
    throw new Error('Need at least one report to calculate uncertainty');
  }
  
  const scores = reports.map(r => r.overall_score);
  
  // Least confidence: 1 - max(score) (assuming score is probability-like)
  const maxScore = Math.max(...scores);
  const leastConfidence = 1 - maxScore;
  
  // Margin: difference between top 2 scores
  const sortedScores = [...scores].sort((a, b) => b - a);
  const margin = sortedScores.length > 1 
    ? sortedScores[0] - sortedScores[1]
    : 0;
  
  // Entropy: -Σ(p * log(p))
  // Normalize scores to probabilities
  const sum = scores.reduce((a, b) => a + b, 0);
  const probabilities = scores.map(s => s / sum);
  const entropy = -probabilities.reduce((sum, p) => {
    if (p > 0) {
      return sum + p * Math.log2(p);
    }
    return sum;
  }, 0);
  
  // Variance across runs
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1);
  
  return {
    least_confidence: leastConfidence,
    margin: margin,
    entropy: entropy,
    variance: variance
  };
}

/**
 * Uncertainty sampling: Least confidence
 * Prioritize cases where model is least confident
 */
export function leastConfidenceSampling(
  conversationId: string,
  reports: AuditReport[]
): AnnotationPriority {
  const metrics = calculateUncertaintyMetrics(reports);
  
  return {
    priority_id: `priority-${conversationId}-${Date.now()}`,
    conversation_id: conversationId,
    priority_score: metrics.least_confidence,
    priority_reason: 'high_uncertainty',
    audit_ids: reports.map(r => r.report_id),
    uncertainty_score: metrics.least_confidence
  };
}

/**
 * Uncertainty sampling: Margin-based
 * Prioritize cases where top 2 predictions are close
 */
export function marginSampling(
  conversationId: string,
  reports: AuditReport[]
): AnnotationPriority {
  const metrics = calculateUncertaintyMetrics(reports);
  
  // Low margin = high priority (hard to decide)
  const priorityScore = 1 - metrics.margin;
  
  return {
    priority_id: `priority-${conversationId}-${Date.now()}`,
    conversation_id: conversationId,
    priority_score: priorityScore,
    priority_reason: 'high_uncertainty',
    audit_ids: reports.map(r => r.report_id),
    uncertainty_score: priorityScore
  };
}

/**
 * Uncertainty sampling: Entropy-based
 * Prioritize cases with high entropy (high uncertainty)
 */
export function entropySampling(
  conversationId: string,
  reports: AuditReport[]
): AnnotationPriority {
  const metrics = calculateUncertaintyMetrics(reports);
  
  // Normalize entropy to [0, 1] (max entropy for n classes is log2(n))
  const maxEntropy = Math.log2(reports.length);
  const normalizedEntropy = maxEntropy > 0 ? metrics.entropy / maxEntropy : 0;
  
  return {
    priority_id: `priority-${conversationId}-${Date.now()}`,
    conversation_id: conversationId,
    priority_score: normalizedEntropy,
    priority_reason: 'high_uncertainty',
    audit_ids: reports.map(r => r.report_id),
    uncertainty_score: normalizedEntropy
  };
}

/**
 * Variance-based sampling
 * Prioritize cases with high variance across runs
 */
export function varianceBasedSampling(
  conversationId: string,
  reports: AuditReport[]
): AnnotationPriority {
  const metrics = calculateUncertaintyMetrics(reports);
  
  // Normalize variance (assuming scores in [0, 1], max variance is 0.25)
  const normalizedVariance = Math.min(1, metrics.variance / 0.25);
  
  return {
    priority_id: `priority-${conversationId}-${Date.now()}`,
    conversation_id: conversationId,
    priority_score: normalizedVariance,
    priority_reason: 'high_variance',
    audit_ids: reports.map(r => r.report_id),
    variance_estimate: metrics.variance
  };
}

/**
 * Boundary case detection
 * Identify cases near decision threshold (e.g., score ≈ 0.5)
 */
export function detectBoundaryCase(
  conversationId: string,
  reports: AuditReport[],
  threshold: number = 0.5,
  tolerance: number = 0.1
): AnnotationPriority | null {
  const meanScore = reports.reduce((sum, r) => sum + r.overall_score, 0) / reports.length;
  const distanceFromThreshold = Math.abs(meanScore - threshold);
  
  if (distanceFromThreshold <= tolerance) {
    // Close to threshold - high priority
    const priorityScore = 1 - (distanceFromThreshold / tolerance);
    
    return {
      priority_id: `priority-${conversationId}-${Date.now()}`,
      conversation_id: conversationId,
      priority_score: priorityScore,
      priority_reason: 'boundary_case',
      audit_ids: reports.map(r => r.report_id)
    };
  }
  
  return null;
}

/**
 * Model disagreement detection
 * Flag cases where different models/judges disagree significantly
 */
export function detectModelDisagreement(
  conversationId: string,
  reports: AuditReport[]
): AnnotationPriority | null {
  if (reports.length < 2) {
    return null; // Need multiple reports to detect disagreement
  }
  
  const scores = reports.map(r => r.overall_score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const disagreementMagnitude = maxScore - minScore;
  
  // High disagreement = high priority
  if (disagreementMagnitude > 0.2) { // 20% threshold
    return {
      priority_id: `priority-${conversationId}-${Date.now()}`,
      conversation_id: conversationId,
      priority_score: disagreementMagnitude,
      priority_reason: 'model_disagreement',
      audit_ids: reports.map(r => r.report_id),
      disagreement_magnitude: disagreementMagnitude
    };
  }
  
  return null;
}

/**
 * Diversity sampling: Core-set selection
 * Select diverse examples that cover the feature space
 */
export function diversitySampling(
  conversations: Array<{ conversation: Conversation; reports: AuditReport[] }>,
  selectCount: number = 10
): AnnotationPriority[] {
  if (conversations.length === 0) {
    return [];
  }
  
  // Calculate feature vectors (simplified: use score statistics)
  const features = conversations.map(({ conversation, reports }) => {
    const scores = reports.map(r => r.overall_score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const stddev = Math.sqrt(
      scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1)
    );
    
    return {
      conversation_id: conversation.conversation_id,
      mean,
      stddev,
      conversation,
      reports
    };
  });
  
  // Core-set selection: Greedy algorithm
  // Start with highest uncertainty example
  const selected: typeof features = [];
  const remaining = [...features];
  
  // First: select highest uncertainty
  remaining.sort((a, b) => b.stddev - a.stddev);
  if (remaining.length > 0) {
    selected.push(remaining.shift()!);
  }
  
  // Then: iteratively select example farthest from all selected
  while (selected.length < selectCount && remaining.length > 0) {
    let maxMinDistance = -1;
    let bestIndex = -1;
    
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      
      // Calculate minimum distance to any selected example
      let minDistance = Infinity;
      for (const selectedItem of selected) {
        const distance = Math.sqrt(
          Math.pow(candidate.mean - selectedItem.mean, 2) +
          Math.pow(candidate.stddev - selectedItem.stddev, 2)
        );
        minDistance = Math.min(minDistance, distance);
      }
      
      if (minDistance > maxMinDistance) {
        maxMinDistance = minDistance;
        bestIndex = i;
      }
    }
    
    if (bestIndex >= 0) {
      selected.push(remaining.splice(bestIndex, 1)[0]);
    } else {
      break;
    }
  }
  
  // Convert to priorities
  return selected.map((item, index) => ({
    priority_id: `priority-${item.conversation_id}-${Date.now()}-${index}`,
    conversation_id: item.conversation_id,
    priority_score: 1 - (index / selectCount), // Higher priority for earlier selections
    priority_reason: 'diversity',
    audit_ids: item.reports.map(r => r.report_id),
    diversity_score: 1 - (index / selectCount)
  }));
}

/**
 * Combined priority scoring
 * Combine multiple uncertainty and diversity signals
 */
export function calculateCombinedPriority(
  conversationId: string,
  reports: AuditReport[],
  weights: {
    uncertainty?: number;
    variance?: number;
    boundary?: number;
    disagreement?: number;
    diversity?: number;
  } = {}
): AnnotationPriority {
  // Default weights
  const defaultWeights = {
    uncertainty: 0.3,
    variance: 0.3,
    boundary: 0.2,
    disagreement: 0.1,
    diversity: 0.1
  };
  
  const finalWeights = { ...defaultWeights, ...weights };
  
  // Calculate individual scores
  const uncertaintyMetrics = calculateUncertaintyMetrics(reports);
  const meanScore = reports.reduce((sum, r) => sum + r.overall_score, 0) / reports.length;
  
  const uncertaintyScore = (uncertaintyMetrics.entropy + uncertaintyMetrics.least_confidence) / 2;
  const varianceScore = Math.min(1, uncertaintyMetrics.variance / 0.25);
  const boundaryScore = Math.abs(meanScore - 0.5) < 0.1 ? 1 - Math.abs(meanScore - 0.5) / 0.1 : 0;
  
  const scores = reports.map(r => r.overall_score);
  const disagreementScore = scores.length > 1 
    ? (Math.max(...scores) - Math.min(...scores))
    : 0;
  
  // Combined score
  const combinedScore = 
    uncertaintyScore * finalWeights.uncertainty! +
    varianceScore * finalWeights.variance! +
    boundaryScore * finalWeights.boundary! +
    disagreementScore * finalWeights.disagreement! +
    0.5 * finalWeights.diversity!; // Diversity would come from global context
  
  // Determine primary reason
  let primaryReason: AnnotationPriority['priority_reason'] = 'high_uncertainty';
  if (varianceScore > uncertaintyScore && varianceScore > boundaryScore) {
    primaryReason = 'high_variance';
  } else if (boundaryScore > 0.5) {
    primaryReason = 'boundary_case';
  } else if (disagreementScore > 0.2) {
    primaryReason = 'model_disagreement';
  }
  
  return {
    priority_id: `priority-${conversationId}-${Date.now()}`,
    conversation_id: conversationId,
    priority_score: combinedScore,
    priority_reason: primaryReason,
    audit_ids: reports.map(r => r.report_id),
    variance_estimate: uncertaintyMetrics.variance,
    disagreement_magnitude: disagreementScore,
    uncertainty_score: uncertaintyScore
  };
}

/**
 * Store priorities in database
 */
export async function storeAnnotationPriorities(
  db: any, // D1Database
  priorities: AnnotationPriority[]
): Promise<void> {
  if (priorities.length === 0) return;
  
  try {
    const statements = priorities.map(priority => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO annotation_priorities (
          priority_id, conversation_id, priority_score, priority_reason,
          audit_ids, variance_estimate, disagreement_magnitude,
          uncertainty_score, diversity_score, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      return stmt.bind(
        priority.priority_id,
        priority.conversation_id,
        priority.priority_score,
        priority.priority_reason,
        priority.audit_ids ? JSON.stringify(priority.audit_ids) : null,
        priority.variance_estimate || null,
        priority.disagreement_magnitude || null,
        priority.uncertainty_score || null,
        priority.diversity_score || null,
        'pending',
        new Date().toISOString()
      );
    });
    
    await db.batch(statements);
  } catch (error) {
    console.error('Error storing annotation priorities:', error);
    throw error;
  }
}

/**
 * Get top priority conversations for annotation
 */
export async function getTopPriorityConversations(
  db: any, // D1Database
  limit: number = 50,
  status: 'pending' | 'in_progress' | 'completed' | 'all' = 'pending'
): Promise<AnnotationPriority[]> {
  try {
    let query = `
      SELECT * FROM annotation_priorities
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY priority_score DESC LIMIT ?';
    params.push(limit);
    
    const stmt = db.prepare(query);
    const results = await stmt.bind(...params).all();
    
    return results.results.map((row: any) => ({
      priority_id: row.priority_id,
      conversation_id: row.conversation_id,
      priority_score: row.priority_score,
      priority_reason: row.priority_reason as AnnotationPriority['priority_reason'],
      audit_ids: row.audit_ids ? JSON.parse(row.audit_ids) : undefined,
      variance_estimate: row.variance_estimate || undefined,
      disagreement_magnitude: row.disagreement_magnitude || undefined,
      uncertainty_score: row.uncertainty_score || undefined,
      diversity_score: row.diversity_score || undefined
    }));
  } catch (error) {
    console.error('Error fetching annotation priorities:', error);
    return [];
  }
}

/**
 * Stopping criteria for active learning
 */
export interface StoppingCriteria {
  performance_plateau: boolean; // Δperf < 0.01 AND Δuncert < 0.05
  budget_exhausted: boolean;
  patience_exceeded: boolean; // N rounds with no improvement
}

export function checkStoppingCriteria(
  previousPerformance: number,
  currentPerformance: number,
  previousUncertainty: number,
  currentUncertainty: number,
  roundsWithoutImprovement: number,
  maxRounds: number = 5,
  budgetRemaining: number = Infinity
): StoppingCriteria {
  const perfDelta = Math.abs(currentPerformance - previousPerformance);
  const uncertDelta = Math.abs(currentUncertainty - previousUncertainty);
  
  const performancePlateau = perfDelta < 0.01 && uncertDelta < 0.05;
  const budgetExhausted = budgetRemaining <= 0;
  const patienceExceeded = roundsWithoutImprovement >= maxRounds;
  
  return {
    performance_plateau: performancePlateau,
    budget_exhausted: budgetExhausted,
    patience_exceeded: patienceExceeded
  };
}

