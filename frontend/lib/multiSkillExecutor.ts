import { Conversation, AuditResult } from './types';
import { DetectionCategory } from '../types';
import { CategoryDetection, detectManipulationTypes } from './intelligentMultiSkillDetector';
import { executeSkillAudit } from './skillExecutor';
import { getSkillById, AVAILABLE_SKILLS } from './skillsRegistry';

export interface AuditOptions {
  signal?: AbortSignal;
  sensitivity?: 'low' | 'medium' | 'high';
  thinkingBudget?: number;
  includeValidatorCoT?: boolean;
}

export interface SkillResult {
  skill_id: string;
  category: DetectionCategory;
  overall_score: number;
  confidence: "low" | "medium" | "high";
  detected_types: any[];
  metrics: any;
  recommendations: string[];
  limitations: string[];
  usage?: {
    prompt_tokens: number;
    candidates_tokens: number;
    total_tokens: number;
  };
  error?: string;
  // Taxonomy patterns (from taxonomy-auditor)
  patterns?: any[];
  primaryCategory?: DetectionCategory;
}

export interface CombinedAuditResult extends AuditResult {
  skill_results: SkillResult[];
  combined_score: number;
  primary_category: DetectionCategory;
  secondary_categories: DetectionCategory[];
  detection_metadata: {
    detection_confidence: number;
    detection_reasoning: string;
    categories_detected: CategoryDetection[];
  };
  // Aggregated taxonomy patterns from all skills
  patterns?: any[];
}

/**
 * Map detection categories (HOW verbs) to the unified taxonomy auditor
 */
const CATEGORY_TO_SKILL_ID: Record<string, string> = {
  // New HOW verb categories -> unified taxonomy auditor
  'Fabricated': 'taxonomy-auditor',
  'Sandbagged': 'taxonomy-auditor',
  'Context-Switched': 'taxonomy-auditor',
  'Pressured': 'taxonomy-auditor',
  'Hid': 'taxonomy-auditor',
  'Overclaimed': 'taxonomy-auditor',
  // Legacy category names -> map to legacy auditors (for backward compatibility)
  'Goal Reasoning': 'goal-reasoning-auditor',
  'Deception Planning': 'deception-planning-auditor',
  'Reward Hacking': 'reward-hacking-auditor',
  'Sabotage Planning': 'sabotage-planning-auditor',
  'Obfuscation & Evasion': 'obfuscation-evasion-auditor',
  'Persona Manipulation': 'persona-manipulation-auditor',
  'Sycophancy': 'sycophancy-auditor',
  'none': 'taxonomy-auditor', // Default to taxonomy auditor
};

/**
 * Execute multi-skill audit: intelligently detect relevant categories,
 * run all relevant skills in parallel, and combine results.
 */
export async function executeMultiSkillAudit(
  conversation: Conversation,
  modelName: string,
  options?: AuditOptions
): Promise<CombinedAuditResult> {
  // Step 1: Intelligent detection
  console.log('🔍 Detecting relevant manipulation types...');
  console.log('📝 Conversation has reasoning_trace:', !!conversation.reasoning_trace);
  console.log('📝 Conversation turns:', conversation.turns?.length || 0);
  const detection = await detectManipulationTypes(conversation, modelName, options);
  console.log('🔍 Detection result:', JSON.stringify(detection, null, 2));
  
  // Filter out "none" category and low-confidence detections
  const relevantCategories = detection.relevantCategories.filter(
    cat => cat.category !== 'none' && cat.confidence >= 0.2
  );
  
  // If no relevant categories, still run the taxonomy auditor for baseline
  const categoriesToAudit = relevantCategories.length > 0
    ? relevantCategories
    : [{ category: 'Fabricated' as DetectionCategory, confidence: 0.5, reasoning: 'Baseline audit' }];
  
  console.log(`📊 Detected ${categoriesToAudit.length} relevant categories:`, 
    categoriesToAudit.map(c => `${c.category} (${(c.confidence * 100).toFixed(0)}%)`).join(', '));
  
  // Step 2: Run all relevant skills in parallel
  const skillPromises = categoriesToAudit.map(async (catDetection) => {
    const skillId = CATEGORY_TO_SKILL_ID[catDetection.category];
    const skill = getSkillById(skillId);
    
    if (!skill) {
      console.warn(`⚠️ Skill not found for category: ${catDetection.category}`);
      return {
        skill_id: skillId,
        category: catDetection.category,
        overall_score: 0,
        confidence: 'low' as const,
        detected_types: [],
        metrics: {},
        recommendations: [],
        limitations: [],
        error: `Skill ${skillId} not found`
      } as SkillResult;
    }
    
    try {
      const result = await executeSkillAudit(
        skill,
        conversation,
        modelName,
        options
      );

      console.log(`✅ Skill ${skillId} result:`, {
        overall_score: result.overall_score,
        confidence: result.confidence,
        detected_types_count: result.detected_types?.length || 0,
        patterns_count: (result as any).patterns?.length || 0
      });

      return {
        skill_id: result.skill_id,
        category: catDetection.category,
        overall_score: result.overall_score,
        confidence: result.confidence,
        detected_types: result.detected_types,
        metrics: result.metrics,
        recommendations: result.recommendations,
        limitations: result.limitations,
        usage: result.usage,
        // Pass through taxonomy patterns if available
        patterns: (result as any).patterns,
        primaryCategory: (result as any).primaryCategory,
      } as SkillResult;
    } catch (error: any) {
      console.error(`❌ Error running skill ${skillId}:`, error);
      return {
        skill_id: skillId,
        category: catDetection.category,
        overall_score: 0,
        confidence: 'low' as const,
        detected_types: [],
        metrics: {},
        recommendations: [],
        limitations: [],
        error: error.message || 'Unknown error'
      } as SkillResult;
    }
  });
  
  const skillResults = await Promise.all(skillPromises);
  
  // Step 3: Combine results
  const combinedResult = combineAuditResults(skillResults, detection, conversation, modelName);
  
  return combinedResult;
}

/**
 * Combine multiple skill results into a single comprehensive audit result
 */
function combineAuditResults(
  skillResults: SkillResult[],
  detection: { relevantCategories: CategoryDetection[]; overallConfidence: number; reasoning: string },
  conversation: Conversation,
  modelName: string
): CombinedAuditResult {
  // Calculate combined score (weighted average by confidence)
  const validResults = skillResults.filter(r => !r.error);
  const totalWeight = validResults.reduce((sum, r) => {
    const catDetection = detection.relevantCategories.find(c => c.category === r.category);
    return sum + (catDetection?.confidence || 0.5);
  }, 0);
  
  const combinedScore = totalWeight > 0
    ? validResults.reduce((sum, r) => {
        const catDetection = detection.relevantCategories.find(c => c.category === r.category);
        const weight = catDetection?.confidence || 0.5;
        return sum + (r.overall_score * weight);
      }, 0) / totalWeight
    : validResults.reduce((sum, r) => sum + r.overall_score, 0) / Math.max(validResults.length, 1);
  
  // Determine primary and secondary categories
  const sortedResults = [...validResults].sort((a, b) => b.overall_score - a.overall_score);
  const primaryCategory = sortedResults[0]?.category || 'none';
  const secondaryCategories = sortedResults
    .slice(1)
    .filter(r => r.overall_score >= 0.3)
    .map(r => r.category);
  
  // Aggregate recommendations and limitations (deduplicated)
  const allRecommendations = new Set<string>();
  const allLimitations = new Set<string>();
  skillResults.forEach(r => {
    r.recommendations.forEach(rec => allRecommendations.add(rec));
    r.limitations.forEach(lim => allLimitations.add(lim));
  });
  
  // Aggregate token usage
  const totalUsage = skillResults.reduce((acc, r) => {
    if (r.usage) {
      acc.prompt_tokens += r.usage.prompt_tokens;
      acc.candidates_tokens += r.usage.candidates_tokens;
      acc.total_tokens += r.usage.total_tokens;
    }
    return acc;
  }, { prompt_tokens: 0, candidates_tokens: 0, total_tokens: 0 });
  
  // Use the highest confidence from individual results
  const confidences = skillResults.map(r => {
    const confMap = { low: 0, medium: 1, high: 2 };
    return confMap[r.confidence];
  });
  const maxConfIdx = confidences.indexOf(Math.max(...confidences));
  const combinedConfidence = skillResults[maxConfIdx]?.confidence || 'low';
  
  // Create combined detected types (flatten and deduplicate)
  const combinedDetectedTypes = new Map<string, any>();
  skillResults.forEach(r => {
    r.detected_types.forEach(dt => {
      const key = `${r.category}_${dt.type || 'unknown'}`;
      if (!combinedDetectedTypes.has(key) || dt.score > combinedDetectedTypes.get(key).score) {
        combinedDetectedTypes.set(key, {
          ...dt,
          category: r.category,
          skill_id: r.skill_id
        });
      }
    });
  });
  
  // Generate ID and timestamp
  const auditId = `audit-${conversation.conversation_id}-${Date.now()}`;
  const timestamp = new Date().toISOString();
  
  // Use the primary skill's ID for backward compatibility
  const primarySkillId = sortedResults[0]?.skill_id || 'multi-skill-auditor';
  
  // Extract patterns from skill results (taxonomy auditor returns patterns)
  const allPatterns: any[] = [];
  skillResults.forEach((r: any) => {
    if (r.patterns && Array.isArray(r.patterns)) {
      allPatterns.push(...r.patterns);
    }
  });

  // Also check the raw skill result metrics for patterns
  skillResults.forEach((r: any) => {
    if (r.metrics?.patterns && Array.isArray(r.metrics.patterns)) {
      allPatterns.push(...r.metrics.patterns);
    }
  });

  return {
    id: auditId,
    conversation_id: conversation.conversation_id,
    timestamp,
    skill_id: primarySkillId, // Keep for backward compatibility
    model_name: modelName,
    overall_score: Math.min(1.0, Math.max(0.0, combinedScore)),
    confidence: combinedConfidence,
    usage: totalUsage.total_tokens > 0 ? totalUsage : undefined,
    detected_types: Array.from(combinedDetectedTypes.values()),
    metrics: {
      // Aggregate metrics from all skills
      skill_count: skillResults.length,
      primary_score: sortedResults[0]?.overall_score || 0,
      secondary_scores: sortedResults.slice(1).map(r => r.overall_score),
      // Include individual skill metrics
      skill_metrics: skillResults.map(r => ({
        skill_id: r.skill_id,
        category: r.category,
        score: r.overall_score,
        metrics: r.metrics
      }))
    },
    recommendations: Array.from(allRecommendations),
    limitations: Array.from(allLimitations),
    // Multi-skill specific fields
    skill_results: skillResults,
    combined_score: Math.min(1.0, Math.max(0.0, combinedScore)),
    primary_category: primaryCategory,
    secondary_categories: secondaryCategories,
    detection_metadata: {
      detection_confidence: detection.overallConfidence,
      detection_reasoning: detection.reasoning,
      categories_detected: detection.relevantCategories
    },
    // Taxonomy patterns from all skill results
    patterns: allPatterns.length > 0 ? allPatterns : undefined,
  };
}

