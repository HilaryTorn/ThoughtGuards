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
      reports,
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
