/**
 * Audit Reports API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const auditReportsRoutes = new Hono<{ Bindings: Env }>();

// Ensure audit_reports table exists
async function ensureTableExists(db: D1Database) {
  try {
    await db.prepare('SELECT 1 FROM audit_reports LIMIT 1').first();
  } catch (error: any) {
    if (error.message?.includes('no such table')) {
      console.warn('audit_reports table does not exist. Run schema migration.');
    }
  }
}

// Get audit reports
auditReportsRoutes.get('/', async (c) => {
  const db = c.env.DB;
  await ensureTableExists(db);

  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');
  const conversationId = c.req.query('conversation_id');
  const skillId = c.req.query('skill_id');
  const modelName = c.req.query('model_name');

  try {
    let query = 'SELECT * FROM audit_reports WHERE 1=1';
    const params: any[] = [];

    if (conversationId) {
      query += ' AND conversation_id = ?';
      params.push(conversationId);
    }

    if (skillId) {
      query += ' AND skill_id = ?';
      params.push(skillId);
    }

    if (modelName) {
      query += ' AND model_name = ?';
      params.push(modelName);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await db.prepare(query).bind(...params).all();

    // Fetch cross-validation data for all traces
    const cvQuery = `
      SELECT conversation_id, full_result, agreement, cohens_kappa, primary_judge, secondary_judge
      FROM cross_validation_runs
      WHERE conversation_id IN (${(result.results || []).map(() => '?').join(',')})
      ORDER BY created_at DESC
    `;
    const cvParams = (result.results || []).map((row: any) => row.conversation_id);
    let cvMap: Record<string, any> = {};
    if (cvParams.length > 0) {
      try {
        const cvResult = await db.prepare(cvQuery).bind(...cvParams).all();
        // Create a map of conversation_id -> cross validation data
        for (const cv of (cvResult.results || []) as any[]) {
          const convId = cv.conversation_id as string;
          if (!cvMap[convId]) {
            try {
              const fullResult = cv.full_result ? JSON.parse(cv.full_result as string) : null;
              // Transform Python format to UI-expected format
              // Python returns: _meta.judges_used, _meta.total_tokens, _individual_results
              // UI expects: _meta.judge_1_model, _meta.judge_2_model, etc.
              const pythonMeta = fullResult?._meta || {};
              const judgesUsed = pythonMeta.judges_used || [];
              const individualResults = fullResult?._individual_results || {};

              // Get individual judge info
              const judge1Id = judgesUsed[0] || cv.primary_judge || Object.keys(individualResults)[0] || 'Unknown';
              const judge2Id = judgesUsed[1] || cv.secondary_judge || Object.keys(individualResults)[1] || 'Unknown';
              const judge1Result = individualResults[judge1Id] || {};
              const judge2Result = individualResults[judge2Id] || {};

              // Calculate match statistics from aggregated patterns
              const patterns = fullResult?.manipulation_evaluations?.[0]?.patterns || [];
              let exactMatches = 0;
              let partialMatches = 0;
              let unmatchedJ1 = 0;
              let unmatchedJ2 = 0;

              for (const pattern of patterns) {
                const matchType = pattern._match_type;
                const nJudgesAgreed = pattern._n_judges_agreed || 1;

                if (matchType === 'exact' || nJudgesAgreed >= 2) {
                  exactMatches++;
                } else if (matchType === 'partial') {
                  partialMatches++;
                } else if (matchType === 'single_judge') {
                  if (pattern._detected_by === 'judge_1') {
                    unmatchedJ1++;
                  } else {
                    unmatchedJ2++;
                  }
                } else if (nJudgesAgreed === 1) {
                  // Single judge detection - count as unmatched
                  unmatchedJ1++;
                }
              }

              cvMap[convId] = {
                _meta: {
                  judge_1_model: judge1Id,
                  judge_2_model: judge2Id,
                  judge_1_tokens: judge1Result._tokens_used || 0,
                  judge_2_tokens: judge2Result._tokens_used || 0,
                  agreement_rate: pythonMeta.agreement_rate ?? (cv.agreement ? 1.0 : 0.0),
                  agreement_type: pythonMeta.agreement_type || (cv.agreement ? 'strong' : 'weak'),
                  exact_matches: pythonMeta.exact_matches ?? exactMatches,
                  partial_matches: pythonMeta.partial_matches ?? partialMatches,
                  unmatched_j1: pythonMeta.unmatched_j1 ?? unmatchedJ1,
                  unmatched_j2: pythonMeta.unmatched_j2 ?? unmatchedJ2,
                  mean_similarity: pythonMeta.mean_similarity || cv.cohens_kappa || 0,
                  judges_used: judgesUsed,
                  total_tokens: pythonMeta.total_tokens || 0,
                },
                ...fullResult
              };
            } catch (e) {
              console.warn('Failed to parse cross-validation result:', e);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to fetch cross-validation data:', e);
      }
    }

    // Helper to determine status from patterns and agreement
    const getStatus = (patternsJson: string | null, detectionMetadata: string | null): string => {
      // Parse patterns to check if any issues were detected
      let hasPatterns = false;
      if (patternsJson) {
        try {
          const patterns = JSON.parse(patternsJson);
          // Only consider as having patterns if there are items with severity > 0
          hasPatterns = Array.isArray(patterns) && patterns.length > 0 &&
            patterns.some((p: any) => (p.severity ?? 0) > 0);
        } catch {
          // If parsing fails, assume no patterns
        }
      }

      // If any patterns with severity detected, flag it
      if (hasPatterns) {
        return 'flagged';
      }

      // Parse detection_metadata to check agreement
      if (detectionMetadata) {
        try {
          const meta = JSON.parse(detectionMetadata);
          const agreementType = meta.agreement_type || '';
          // If judges disagree (weak, none, partial), mark for review
          if (['weak', 'none', 'partial'].includes(agreementType)) {
            return 'review';
          }
        } catch {
          // If parsing fails, fall through to clean
        }
      }

      // Only clean if no patterns detected AND high agreement
      return 'clean';
    };

    // Helper to calculate max severity from patterns
    const getMaxSeverity = (patternsJson: string | null): number => {
      if (!patternsJson) return 0;
      try {
        const patterns = JSON.parse(patternsJson);
        if (!Array.isArray(patterns)) return 0;
        return patterns.reduce((max: number, p: any) => Math.max(max, p.severity ?? 0), 0);
      } catch {
        return 0;
      }
    };

    // Transform Python evaluator pattern format to frontend TaxonomyPattern format
    const transformPattern = (p: any) => ({
      ...p,
      triad: p.triad_pattern_id || p.triad,
      how_code: p.labels?.HOW || p.how_code,
      why_code: p.labels?.WHY || p.why_code,
      target_code: p.labels?.TARGET || p.target_code,
      pattern_confidence: p.confidence || p.pattern_confidence,
      severity: p.severity ?? 0,
    });

    // Convert to frontend-expected format (matching old audit-results format)
    const traces = (result.results || []).map((row: any) => {
      const maxSeverity = getMaxSeverity(row.patterns);
      return {
        id: row.report_id,
        timestamp: row.created_at ? new Date(row.created_at).toLocaleTimeString() : 'N/A',
        messageCount: 0,
        status: maxSeverity > 0 ? 'flagged' : 'clean',
        riskScore: maxSeverity * 20, // Convert 1-5 severity to 0-100 scale
        maxSeverity,
        detectionEvent: maxSeverity > 0 ? {
          category: row.primary_category || 'Unknown',
          timestamp: row.created_at,
          context: `Skill: ${row.skill_id}`,
          severity: maxSeverity
        } : undefined,
      conversation: row.conversation_snapshot ? JSON.parse(row.conversation_snapshot) : [],
      auditId: row.report_id,
      conversationId: row.conversation_id,
      skillId: row.skill_id || '',
      modelName: row.model_name || '',
      overallScore: row.overall_score || 0,
      confidence: row.confidence || 'low',
      detectedTypes: row.detected_types ? JSON.parse(row.detected_types) : [],
      metrics: row.metrics ? JSON.parse(row.metrics) : {},
      recommendations: row.recommendations ? JSON.parse(row.recommendations) : [],
      limitations: row.limitations ? JSON.parse(row.limitations) : [],
      usage: row.usage ? JSON.parse(row.usage) : undefined,
      skillResults: row.skill_results ? JSON.parse(row.skill_results) : undefined,
      combinedScore: row.combined_score !== null ? row.combined_score : undefined,
      primaryCategory: row.primary_category || undefined,
      secondaryCategories: row.secondary_categories ? JSON.parse(row.secondary_categories) : undefined,
      detectionMetadata: row.detection_metadata ? JSON.parse(row.detection_metadata) : undefined,
      patterns: row.patterns ? JSON.parse(row.patterns).map(transformPattern) : undefined,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.created_at || new Date().toISOString(),
      crossValidation: cvMap[row.conversation_id] || undefined,
      };
    });

    const reports = (result.results || []).map(convertDbRowToReport);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM audit_reports WHERE 1=1';
    const countParams: any[] = [];

    if (conversationId) {
      countQuery += ' AND conversation_id = ?';
      countParams.push(conversationId);
    }
    if (skillId) {
      countQuery += ' AND skill_id = ?';
      countParams.push(skillId);
    }
    if (modelName) {
      countQuery += ' AND model_name = ?';
      countParams.push(modelName);
    }

    const countResult = await db.prepare(countQuery).bind(...countParams).first<{ count: number }>();

    return c.json({
      traces, // Frontend expects this
      reports, // Keep for API consumers that expect reports
      total: countResult?.count || 0,
      limit,
      offset
    });
  } catch (error: any) {
    console.error('Error fetching reports:', error);
    return c.json({ error: error.message || 'Failed to fetch reports' }, 500);
  }
});

// Get single report
auditReportsRoutes.get('/:reportId', async (c) => {
  const db = c.env.DB;
  const reportId = c.req.param('reportId');

  try {
    const row = await db.prepare('SELECT * FROM audit_reports WHERE report_id = ?')
      .bind(reportId)
      .first();

    if (!row) {
      return c.json({ error: 'Report not found' }, 404);
    }

    return c.json(convertDbRowToReport(row));
  } catch (error: any) {
    console.error('Error fetching report:', error);
    return c.json({ error: error.message || 'Failed to fetch report' }, 500);
  }
});

// Create report
auditReportsRoutes.post('/', async (c) => {
  const db = c.env.DB;
  await ensureTableExists(db);

  try {
    const report = await c.req.json();

    if (!report.report_id || !report.conversation_id || !report.skill_id) {
      return c.json({
        error: 'Missing required fields: report_id, conversation_id, skill_id'
      }, 400);
    }

    await db.prepare(`
      INSERT OR REPLACE INTO audit_reports (
        report_id, conversation_id, created_at, created_by, execution_duration_ms,
        skill_id, skill_version, model_name, model_version,
        llm_parameters, prompt_hash, prompt_version, timestamp_utc,
        system_fingerprint, response_hash, completion_tokens, prompt_tokens,
        cached_tokens, latency_ms, finish_reason, cache_hit,
        evaluator_model, evaluation_seed, evaluation_prompt_version,
        position_variant, prompt_patch_id, cache_key,
        overall_score, confidence, detected_types, metrics,
        recommendations, limitations, usage,
        skill_results, combined_score, primary_category, secondary_categories,
        detection_metadata, patterns, conversation_snapshot, tags, notes, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      report.report_id,
      report.conversation_id,
      report.created_at,
      report.created_by || null,
      report.execution_duration_ms || null,
      report.skill_id,
      report.skill_version,
      report.model_name,
      report.model_version || null,
      JSON.stringify(report.llm_parameters),
      report.prompt_hash,
      report.prompt_version,
      report.timestamp_utc,
      report.system_fingerprint || null,
      report.response_hash,
      report.completion_tokens,
      report.prompt_tokens,
      report.cached_tokens || 0,
      report.latency_ms || null,
      report.finish_reason || null,
      report.cache_hit ? 1 : 0,
      report.evaluator_model,
      report.evaluation_seed || null,
      report.evaluation_prompt_version || null,
      report.position_variant || null,
      report.prompt_patch_id || null,
      report.cache_key || null,
      report.overall_score,
      report.confidence,
      JSON.stringify(report.detected_types),
      JSON.stringify(report.metrics),
      report.recommendations ? JSON.stringify(report.recommendations) : null,
      report.limitations ? JSON.stringify(report.limitations) : null,
      report.usage ? JSON.stringify(report.usage) : null,
      report.skill_results ? JSON.stringify(report.skill_results) : null,
      report.combined_score || null,
      report.primary_category || null,
      report.secondary_categories ? JSON.stringify(report.secondary_categories) : null,
      report.detection_metadata ? JSON.stringify(report.detection_metadata) : null,
      report.patterns ? JSON.stringify(report.patterns) : null,
      JSON.stringify(report.conversation_snapshot),
      report.tags ? JSON.stringify(report.tags) : null,
      report.notes || null,
      report.error_message || null
    ).run();

    return c.json({ success: true, report_id: report.report_id }, 201);
  } catch (error: any) {
    console.error('Error creating report:', error);
    return c.json({ error: error.message || 'Failed to create report' }, 500);
  }
});

// Update report (tags, notes only)
auditReportsRoutes.put('/:reportId', async (c) => {
  const db = c.env.DB;
  const reportId = c.req.param('reportId');

  try {
    const body = await c.req.json();
    const updates: string[] = [];
    const params: any[] = [];

    if (body.tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(body.tags));
    }

    if (body.notes !== undefined) {
      updates.push('notes = ?');
      params.push(body.notes);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    params.push(reportId);

    const query = `UPDATE audit_reports SET ${updates.join(', ')} WHERE report_id = ?`;
    await db.prepare(query).bind(...params).run();

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error updating report:', error);
    return c.json({ error: error.message || 'Failed to update report' }, 500);
  }
});

// Delete report
auditReportsRoutes.delete('/:reportId', async (c) => {
  const db = c.env.DB;
  const reportId = c.req.param('reportId');

  try {
    await db.prepare('DELETE FROM audit_reports WHERE report_id = ?').bind(reportId).run();
    await db.prepare('DELETE FROM report_cache WHERE report_id = ?').bind(reportId).run();
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting report:', error);
    return c.json({ error: error.message || 'Failed to delete report' }, 500);
  }
});

// Convert database row to report object
function convertDbRowToReport(row: any): any {
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
    llm_parameters: row.llm_parameters ? JSON.parse(row.llm_parameters) : {},
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
    confidence: row.confidence,
    detected_types: row.detected_types ? JSON.parse(row.detected_types) : [],
    metrics: row.metrics ? JSON.parse(row.metrics) : {},
    recommendations: row.recommendations ? JSON.parse(row.recommendations) : [],
    limitations: row.limitations ? JSON.parse(row.limitations) : [],
    usage: row.usage ? JSON.parse(row.usage) : undefined,
    skill_results: row.skill_results ? JSON.parse(row.skill_results) : undefined,
    combined_score: row.combined_score || undefined,
    primary_category: row.primary_category || undefined,
    secondary_categories: row.secondary_categories ? JSON.parse(row.secondary_categories) : undefined,
    detection_metadata: row.detection_metadata ? JSON.parse(row.detection_metadata) : undefined,
    patterns: row.patterns ? JSON.parse(row.patterns) : undefined,
    conversation_snapshot: row.conversation_snapshot ? JSON.parse(row.conversation_snapshot) : {},
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    notes: row.notes || undefined,
    error_message: row.error_message || undefined
  };
}
