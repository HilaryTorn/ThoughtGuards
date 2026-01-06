/**
 * Audit Results API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const auditResultsRoutes = new Hono<{ Bindings: Env }>();

// Ensure audit_results table exists with full schema
async function ensureTableExists(db: D1Database) {
  try {
    await db.prepare('SELECT 1 FROM audit_results LIMIT 1').first();
  } catch (error: any) {
    if (error.message?.includes('no such table')) {
      // Create the table with full schema
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS audit_results (
          audit_id TEXT PRIMARY KEY,
          trace_id TEXT NOT NULL UNIQUE,
          conversation_id TEXT NOT NULL,
          skill_id TEXT NOT NULL,
          model_name TEXT NOT NULL,
          overall_score REAL NOT NULL,
          confidence TEXT NOT NULL,
          status TEXT NOT NULL,
          risk_score REAL NOT NULL,
          detected_types TEXT,
          metrics TEXT,
          recommendations TEXT,
          limitations TEXT,
          usage TEXT,
          detection_event TEXT,
          conversation_data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          skill_results TEXT,
          combined_score REAL,
          primary_category TEXT,
          secondary_categories TEXT,
          detection_metadata TEXT,
          run_count INTEGER DEFAULT 1,
          score_mean REAL,
          score_stddev REAL,
          score_p5 REAL,
          score_p50 REAL,
          score_p95 REAL,
          score_ci_lower REAL,
          score_ci_upper REAL,
          calibration_metrics TEXT,
          raw_response TEXT,
          FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
        )
      `).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_results_conversation_id ON audit_results(conversation_id)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_results_trace_id ON audit_results(trace_id)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_results_created_at ON audit_results(created_at)').run();
    }
  }
}

// Get audit results with filtering
auditResultsRoutes.get('/', async (c) => {
  const db = c.env.DB;
  await ensureTableExists(db);

  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const conversationId = c.req.query('conversation_id');
  const modelName = c.req.query('model_name');
  const minScore = c.req.query('min_score');
  const maxScore = c.req.query('max_score');
  const status = c.req.query('status');

  try {
    let query = 'SELECT * FROM audit_results WHERE 1=1';
    const params: any[] = [];

    if (conversationId) {
      query += ' AND conversation_id = ?';
      params.push(conversationId);
    }

    if (modelName) {
      query += ' AND model_name = ?';
      params.push(modelName);
    }

    if (minScore) {
      query += ' AND overall_score >= ?';
      params.push(parseFloat(minScore));
    }

    if (maxScore) {
      query += ' AND overall_score <= ?';
      params.push(parseFloat(maxScore));
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await db.prepare(query).bind(...params).all();

    // Parse JSON fields
    const results = (result.results || []).map((row: any) => ({
      ...row,
      detected_types: row.detected_types ? JSON.parse(row.detected_types) : [],
      metrics: row.metrics ? JSON.parse(row.metrics) : {},
      recommendations: row.recommendations ? JSON.parse(row.recommendations) : [],
      limitations: row.limitations ? JSON.parse(row.limitations) : [],
      secondary_categories: row.secondary_categories ? JSON.parse(row.secondary_categories) : [],
      conversation_data: row.conversation_data ? JSON.parse(row.conversation_data) : [],
      detection_event: row.detection_event ? JSON.parse(row.detection_event) : null,
      skill_results: row.skill_results ? JSON.parse(row.skill_results) : null,
      detection_metadata: row.detection_metadata ? JSON.parse(row.detection_metadata) : null,
      usage: row.usage ? JSON.parse(row.usage) : null,
    }));

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM audit_results WHERE 1=1';
    const countParams: any[] = [];

    if (conversationId) {
      countQuery += ' AND conversation_id = ?';
      countParams.push(conversationId);
    }
    if (modelName) {
      countQuery += ' AND model_name = ?';
      countParams.push(modelName);
    }
    if (minScore) {
      countQuery += ' AND overall_score >= ?';
      countParams.push(parseFloat(minScore));
    }
    if (maxScore) {
      countQuery += ' AND overall_score <= ?';
      countParams.push(parseFloat(maxScore));
    }
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    const countResult = await db.prepare(countQuery).bind(...countParams).first<{ count: number }>();

    return c.json({
      results,
      total: countResult?.count || 0,
      limit,
      offset
    });
  } catch (error: any) {
    console.error('Error fetching audit results:', error);
    return c.json({ error: error.message || 'Failed to fetch audit results' }, 500);
  }
});

// Get single audit result
auditResultsRoutes.get('/:auditId', async (c) => {
  const db = c.env.DB;
  const auditId = c.req.param('auditId');

  try {
    const result = await db.prepare('SELECT * FROM audit_results WHERE audit_id = ?')
      .bind(auditId)
      .first();

    if (!result) {
      return c.json({ error: 'Audit result not found' }, 404);
    }

    return c.json({
      ...result,
      detected_types: result.detected_types ? JSON.parse(result.detected_types as string) : [],
      metrics: result.metrics ? JSON.parse(result.metrics as string) : {},
      recommendations: result.recommendations ? JSON.parse(result.recommendations as string) : [],
      limitations: result.limitations ? JSON.parse(result.limitations as string) : [],
      secondary_categories: result.secondary_categories ? JSON.parse(result.secondary_categories as string) : [],
      conversation_data: result.conversation_data ? JSON.parse(result.conversation_data as string) : [],
      detection_event: result.detection_event ? JSON.parse(result.detection_event as string) : null,
      skill_results: result.skill_results ? JSON.parse(result.skill_results as string) : null,
      detection_metadata: result.detection_metadata ? JSON.parse(result.detection_metadata as string) : null,
      usage: result.usage ? JSON.parse(result.usage as string) : null,
    });
  } catch (error: any) {
    console.error('Error fetching audit result:', error);
    return c.json({ error: error.message || 'Failed to fetch audit result' }, 500);
  }
});

// Create audit result
auditResultsRoutes.post('/', async (c) => {
  const db = c.env.DB;
  await ensureTableExists(db);

  try {
    const body = await c.req.json();
    const {
      audit_id,
      trace_id,
      conversation_id,
      skill_id,
      model_name,
      overall_score,
      confidence,
      status,
      risk_score,
      detected_types,
      metrics,
      recommendations,
      limitations,
      usage,
      detection_event,
      conversation_data,
      skill_results,
      combined_score,
      primary_category,
      secondary_categories,
      detection_metadata,
      run_count,
      statistics,
    } = body;

    if (!audit_id || !trace_id || !conversation_id) {
      return c.json({
        error: 'Missing required fields: audit_id, trace_id, conversation_id'
      }, 400);
    }

    const now = new Date().toISOString();

    // Extract statistical data if provided
    const scoreMean = statistics?.mean;
    const scoreStddev = statistics?.stddev;
    const scoreP5 = statistics?.quantiles?.p5;
    const scoreP50 = statistics?.quantiles?.p50;
    const scoreP95 = statistics?.quantiles?.p95;
    const scoreCiLower = statistics?.confidenceInterval?.lower;
    const scoreCiUpper = statistics?.confidenceInterval?.upper;

    await db.prepare(`
      INSERT OR REPLACE INTO audit_results (
        audit_id, trace_id, conversation_id, skill_id, model_name,
        overall_score, confidence, status, risk_score,
        detected_types, metrics, recommendations, limitations, usage,
        detection_event, conversation_data,
        skill_results, combined_score, primary_category, secondary_categories, detection_metadata,
        run_count, score_mean, score_stddev, score_p5, score_p50, score_p95, score_ci_lower, score_ci_upper,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      audit_id,
      trace_id,
      conversation_id,
      skill_id || '',
      model_name || '',
      overall_score || 0,
      confidence || 'low',
      status || 'clean',
      risk_score || 0,
      detected_types ? JSON.stringify(detected_types) : '[]',
      metrics ? JSON.stringify(metrics) : '{}',
      recommendations ? JSON.stringify(recommendations) : '[]',
      limitations ? JSON.stringify(limitations) : '[]',
      usage ? JSON.stringify(usage) : null,
      detection_event ? JSON.stringify(detection_event) : null,
      conversation_data ? JSON.stringify(conversation_data) : '[]',
      skill_results ? JSON.stringify(skill_results) : null,
      combined_score !== undefined ? combined_score : null,
      primary_category || null,
      secondary_categories ? JSON.stringify(secondary_categories) : null,
      detection_metadata ? JSON.stringify(detection_metadata) : null,
      run_count || 1,
      scoreMean !== undefined ? scoreMean : null,
      scoreStddev !== undefined ? scoreStddev : null,
      scoreP5 !== undefined ? scoreP5 : null,
      scoreP50 !== undefined ? scoreP50 : null,
      scoreP95 !== undefined ? scoreP95 : null,
      scoreCiLower !== undefined ? scoreCiLower : null,
      scoreCiUpper !== undefined ? scoreCiUpper : null,
      now,
      now
    ).run();

    return c.json({ success: true, audit_id, trace_id }, 201);
  } catch (error: any) {
    console.error('Error creating audit result:', error);
    return c.json({ error: error.message || 'Failed to create audit result' }, 500);
  }
});

// Delete audit result
auditResultsRoutes.delete('/:auditId', async (c) => {
  const db = c.env.DB;
  const auditId = c.req.param('auditId');

  try {
    await db.prepare('DELETE FROM audit_results WHERE audit_id = ?').bind(auditId).run();
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting audit result:', error);
    return c.json({ error: error.message || 'Failed to delete audit result' }, 500);
  }
});
