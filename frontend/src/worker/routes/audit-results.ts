/**
 * Audit Results API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const auditResultsRoutes = new Hono<{ Bindings: Env }>();

// Ensure audit_results table exists
async function ensureTableExists(db: D1Database) {
  try {
    await db.prepare('SELECT 1 FROM audit_results LIMIT 1').first();
  } catch (error: any) {
    if (error.message?.includes('no such table')) {
      // Create the table
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS audit_results (
          audit_id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          model_name TEXT NOT NULL,
          overall_score REAL NOT NULL,
          confidence TEXT NOT NULL,
          detected_types TEXT,
          metrics TEXT,
          recommendations TEXT,
          raw_response TEXT,
          primary_category TEXT,
          secondary_categories TEXT,
          score_mean REAL,
          score_stddev REAL,
          run_count INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
        )
      `).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_results_conversation_id ON audit_results(conversation_id)').run();
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

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await db.prepare(query).bind(...params).all();

    // Parse JSON fields
    const results = (result.results || []).map((row: any) => ({
      ...row,
      detected_types: row.detected_types ? JSON.parse(row.detected_types) : [],
      metrics: row.metrics ? JSON.parse(row.metrics) : {},
      recommendations: row.recommendations ? JSON.parse(row.recommendations) : [],
      secondary_categories: row.secondary_categories ? JSON.parse(row.secondary_categories) : []
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
      secondary_categories: result.secondary_categories ? JSON.parse(result.secondary_categories as string) : []
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
      conversation_id,
      model_name,
      overall_score,
      confidence,
      detected_types,
      metrics,
      recommendations,
      raw_response,
      primary_category,
      secondary_categories,
      score_mean,
      score_stddev,
      run_count
    } = body;

    if (!audit_id || !conversation_id || !model_name || overall_score === undefined || !confidence) {
      return c.json({
        error: 'Missing required fields: audit_id, conversation_id, model_name, overall_score, confidence'
      }, 400);
    }

    const now = new Date().toISOString();

    await db.prepare(`
      INSERT OR REPLACE INTO audit_results (
        audit_id, conversation_id, model_name, overall_score, confidence,
        detected_types, metrics, recommendations, raw_response,
        primary_category, secondary_categories, score_mean, score_stddev, run_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      audit_id,
      conversation_id,
      model_name,
      overall_score,
      confidence,
      detected_types ? JSON.stringify(detected_types) : null,
      metrics ? JSON.stringify(metrics) : null,
      recommendations ? JSON.stringify(recommendations) : null,
      raw_response || null,
      primary_category || null,
      secondary_categories ? JSON.stringify(secondary_categories) : null,
      score_mean ?? overall_score,
      score_stddev ?? 0,
      run_count ?? 1,
      now
    ).run();

    return c.json({ success: true, audit_id }, 201);
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
