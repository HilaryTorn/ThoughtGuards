import { AuditReport, LLMParameters } from '../types';
import { generateCacheKey, serializeLLMParameters, hashLLMParameters } from './llmParameterTracker';

/**
 * Cache manager for audit reports.
 * Generates cache keys, checks/stores cache, supports TTL and invalidation.
 */

export interface CacheEntry {
  cache_key: string;
  report_id: string;
  conversation_id: string;
  skill_id: string;
  skill_version: string;
  llm_parameters_hash: string;
  created_at: string;
  expires_at?: string;
  hit_count: number;
  last_hit_at?: string;
}

/**
 * Generate cache key from conversation, skill, and parameters
 */
export function generateReportCacheKey(
  conversationId: string,
  skillId: string,
  skillVersion: string,
  params: LLMParameters
): string {
  return generateCacheKey(conversationId, skillId, skillVersion, params);
}

/**
 * Check cache for existing report
 */
export async function checkCache(
  db: any, // D1Database
  cacheKey: string
): Promise<AuditReport | null> {
  try {
    // First check cache table
    const cacheStmt = db.prepare(`
      SELECT report_id, expires_at, last_hit_at
      FROM report_cache
      WHERE cache_key = ?
    `);
    
    const cacheEntry = await cacheStmt.bind(cacheKey).first();
    
    if (!cacheEntry) {
      return null;
    }
    
    // Check if expired
    if (cacheEntry.expires_at) {
      const expiresAt = new Date(cacheEntry.expires_at);
      if (expiresAt < new Date()) {
        // Cache expired, remove it
        await invalidateCache(db, cacheKey);
        return null;
      }
    }
    
    // Fetch the actual report
    const reportStmt = db.prepare(`
      SELECT * FROM audit_reports
      WHERE report_id = ?
    `);
    
    const reportRow = await reportStmt.bind(cacheEntry.report_id).first();
    
    if (!reportRow) {
      // Report doesn't exist, remove cache entry
      await invalidateCache(db, cacheKey);
      return null;
    }
    
    // Update hit count and last hit time
    await updateCacheHit(db, cacheKey);
    
    // Convert database row to AuditReport
    return convertDbRowToReport(reportRow);
    
  } catch (error) {
    console.error('Error checking cache:', error);
    return null;
  }
}

/**
 * Store report in cache
 */
export async function storeCache(
  db: any, // D1Database
  report: AuditReport,
  ttlHours?: number // Optional TTL in hours
): Promise<void> {
  try {
    const cacheKey = report.cache_key || generateReportCacheKey(
      report.conversation_id,
      report.skill_id,
      report.skill_version,
      report.llm_parameters
    );
    
    const paramsHash = hashLLMParameters(report.llm_parameters);
    const expiresAt = ttlHours 
      ? new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()
      : null;
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO report_cache (
        cache_key, report_id, conversation_id, skill_id, skill_version,
        llm_parameters_hash, created_at, expires_at, hit_count, last_hit_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      cacheKey,
      report.report_id,
      report.conversation_id,
      report.skill_id,
      report.skill_version,
      paramsHash,
      report.created_at,
      expiresAt,
      0, // Initial hit count
      null // No hits yet
    ).run();
    
  } catch (error) {
    console.error('Error storing cache:', error);
    // Don't throw - caching is best effort
  }
}

/**
 * Invalidate cache entry
 */
export async function invalidateCache(
  db: any, // D1Database
  cacheKey: string
): Promise<void> {
  try {
    const stmt = db.prepare(`
      DELETE FROM report_cache
      WHERE cache_key = ?
    `);
    
    await stmt.bind(cacheKey).run();
  } catch (error) {
    console.error('Error invalidating cache:', error);
  }
}

/**
 * Invalidate cache for a conversation (all reports for that conversation)
 */
export async function invalidateConversationCache(
  db: any, // D1Database
  conversationId: string
): Promise<void> {
  try {
    const stmt = db.prepare(`
      DELETE FROM report_cache
      WHERE conversation_id = ?
    `);
    
    await stmt.bind(conversationId).run();
  } catch (error) {
    console.error('Error invalidating conversation cache:', error);
  }
}

/**
 * Invalidate cache for a skill version (when skill is updated)
 */
export async function invalidateSkillVersionCache(
  db: any, // D1Database
  skillId: string,
  skillVersion: string
): Promise<void> {
  try {
    const stmt = db.prepare(`
      DELETE FROM report_cache
      WHERE skill_id = ? AND skill_version = ?
    `);
    
    await stmt.bind(skillId, skillVersion).run();
  } catch (error) {
    console.error('Error invalidating skill version cache:', error);
  }
}

/**
 * Bulk cache invalidation
 */
export async function bulkInvalidateCache(
  db: any, // D1Database
  cacheKeys: string[]
): Promise<void> {
  if (cacheKeys.length === 0) return;
  
  try {
    // Use batch for efficiency
    const statements = cacheKeys.map(key => 
      db.prepare(`DELETE FROM report_cache WHERE cache_key = ?`).bind(key)
    );
    
    await db.batch(statements);
  } catch (error) {
    console.error('Error bulk invalidating cache:', error);
  }
}

/**
 * Update cache hit statistics
 */
async function updateCacheHit(
  db: any, // D1Database
  cacheKey: string
): Promise<void> {
  try {
    const stmt = db.prepare(`
      UPDATE report_cache
      SET hit_count = hit_count + 1,
          last_hit_at = ?
      WHERE cache_key = ?
    `);
    
    await stmt.bind(new Date().toISOString(), cacheKey).run();
  } catch (error) {
    console.error('Error updating cache hit:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(
  db: any // D1Database
): Promise<{
  totalEntries: number;
  totalHits: number;
  hitRate: number;
  expiredEntries: number;
}> {
  try {
    const totalStmt = db.prepare(`
      SELECT COUNT(*) as count, SUM(hit_count) as total_hits
      FROM report_cache
    `);
    
    const totalResult = await totalStmt.first();
    
    const expiredStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM report_cache
      WHERE expires_at IS NOT NULL AND expires_at < ?
    `);
    
    const expiredResult = await expiredStmt.bind(new Date().toISOString()).first();
    
    const totalEntries = totalResult?.count || 0;
    const totalHits = totalResult?.total_hits || 0;
    const expiredEntries = expiredResult?.count || 0;
    const hitRate = totalEntries > 0 ? totalHits / totalEntries : 0;
    
    return {
      totalEntries,
      totalHits,
      hitRate,
      expiredEntries
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return {
      totalEntries: 0,
      totalHits: 0,
      hitRate: 0,
      expiredEntries: 0
    };
  }
}

/**
 * Clean expired cache entries
 */
export async function cleanExpiredCache(
  db: any // D1Database
): Promise<number> {
  try {
    const stmt = db.prepare(`
      DELETE FROM report_cache
      WHERE expires_at IS NOT NULL AND expires_at < ?
    `);
    
    const result = await stmt.bind(new Date().toISOString()).run();
    return result.meta.changes || 0;
  } catch (error) {
    console.error('Error cleaning expired cache:', error);
    return 0;
  }
}

/**
 * Convert database row to AuditReport
 */
function convertDbRowToReport(row: any): AuditReport {
  return {
    report_id: row.report_id,
    conversation_id: row.conversation_id,
    created_at: row.created_at,
    created_by: row.created_by || undefined,
    execution_duration_ms: row.execution_duration_ms || undefined,
    skill_id: row.skill_id,
    skill_version: row.skill_version,
    model_name: row.model_name,
    model_version: row.model_version || undefined,
    llm_parameters: JSON.parse(row.llm_parameters),
    prompt_hash: row.prompt_hash,
    prompt_version: row.prompt_version,
    timestamp_utc: row.timestamp_utc,
    system_fingerprint: row.system_fingerprint || undefined,
    response_hash: row.response_hash,
    completion_tokens: row.completion_tokens,
    prompt_tokens: row.prompt_tokens,
    cached_tokens: row.cached_tokens || 0,
    latency_ms: row.latency_ms || undefined,
    finish_reason: row.finish_reason || undefined,
    cache_hit: row.cache_hit === 1,
    evaluator_model: row.evaluator_model,
    evaluation_seed: row.evaluation_seed || undefined,
    evaluation_prompt_version: row.evaluation_prompt_version || undefined,
    position_variant: row.position_variant || undefined,
    prompt_patch_id: row.prompt_patch_id || undefined,
    cache_key: row.cache_key || undefined,
    overall_score: row.overall_score,
    confidence: row.confidence as 'low' | 'medium' | 'high',
    detected_types: JSON.parse(row.detected_types),
    metrics: JSON.parse(row.metrics),
    recommendations: row.recommendations ? JSON.parse(row.recommendations) : [],
    limitations: row.limitations ? JSON.parse(row.limitations) : [],
    usage: row.usage ? JSON.parse(row.usage) : undefined,
    skill_results: row.skill_results ? JSON.parse(row.skill_results) : undefined,
    combined_score: row.combined_score || undefined,
    primary_category: row.primary_category || undefined,
    secondary_categories: row.secondary_categories ? JSON.parse(row.secondary_categories) : undefined,
    detection_metadata: row.detection_metadata ? JSON.parse(row.detection_metadata) : undefined,
    conversation_snapshot: JSON.parse(row.conversation_snapshot),
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    notes: row.notes || undefined,
    error_message: row.error_message || undefined
  };
}

/**
 * Cache warming: Pre-compute common parameter combinations
 */
export async function warmCache(
  db: any, // D1Database
  conversationIds: string[],
  skillId: string,
  skillVersion: string,
  commonParameterSets: LLMParameters[]
): Promise<number> {
  // This would trigger report generation for common parameter combinations
  // Implementation depends on report executor integration
  // For now, return 0 (no warming performed)
  return 0;
}

