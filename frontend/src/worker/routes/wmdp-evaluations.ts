/**
 * WMDP Evaluations API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const wmdpEvaluationsRoutes = new Hono<{ Bindings: Env }>();

// Ensure table exists
async function ensureTableExists(db: D1Database) {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS wmdp_evaluations (
        evaluation_id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        category TEXT NOT NULL,
        question TEXT NOT NULL,
        model_response TEXT,
        is_hazardous INTEGER NOT NULL,
        confidence REAL NOT NULL,
        evaluation_timestamp TEXT NOT NULL,
        model_name TEXT NOT NULL,
        comparison_to_baseline TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_wmdp_question_id ON wmdp_evaluations(question_id);
      CREATE INDEX IF NOT EXISTS idx_wmdp_category ON wmdp_evaluations(category);
      CREATE INDEX IF NOT EXISTS idx_wmdp_model_name ON wmdp_evaluations(model_name);
      CREATE INDEX IF NOT EXISTS idx_wmdp_timestamp ON wmdp_evaluations(evaluation_timestamp);
    `);
  } catch (error) {
    console.error('Error creating wmdp_evaluations table:', error);
  }
}

// Get evaluations
wmdpEvaluationsRoutes.get('/', async (c) => {
  const db = c.env.DB;
  await ensureTableExists(db);

  const questionId = c.req.query('question_id');
  const category = c.req.query('category');
  const modelName = c.req.query('model_name');
  const limit = parseInt(c.req.query('limit') || '1000');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    let query = 'SELECT * FROM wmdp_evaluations WHERE 1=1';
    const params: any[] = [];

    if (questionId) {
      query += ' AND question_id = ?';
      params.push(questionId);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (modelName) {
      query += ' AND model_name = ?';
      params.push(modelName);
    }

    query += ' ORDER BY evaluation_timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await db.prepare(query).bind(...params).all();

    const evaluations = (result.results || []).map((row: any) => ({
      question_id: row.question_id,
      category: row.category,
      question: row.question,
      model_response: row.model_response || '',
      is_hazardous: row.is_hazardous === 1,
      confidence: row.confidence,
      evaluation_timestamp: row.evaluation_timestamp,
      model_name: row.model_name,
      comparison_to_baseline: row.comparison_to_baseline
        ? JSON.parse(row.comparison_to_baseline)
        : undefined
    }));

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM wmdp_evaluations WHERE 1=1';
    const countParams: any[] = [];

    if (questionId) {
      countQuery += ' AND question_id = ?';
      countParams.push(questionId);
    }
    if (category) {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }
    if (modelName) {
      countQuery += ' AND model_name = ?';
      countParams.push(modelName);
    }

    const countResult = await db.prepare(countQuery).bind(...countParams).first<{ total: number }>();

    return c.json({
      evaluations,
      total: countResult?.total || 0,
      limit,
      offset
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create evaluation
wmdpEvaluationsRoutes.post('/', async (c) => {
  const db = c.env.DB;
  await ensureTableExists(db);

  try {
    const evaluation = await c.req.json();

    const evaluationId = `wmdp_${evaluation.question_id}_${evaluation.model_name}_${Date.now()}`;

    await db.prepare(`
      INSERT OR REPLACE INTO wmdp_evaluations (
        evaluation_id, question_id, category, question, model_response,
        is_hazardous, confidence, evaluation_timestamp, model_name,
        comparison_to_baseline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      evaluationId,
      evaluation.question_id,
      evaluation.category,
      evaluation.question,
      evaluation.model_response,
      evaluation.is_hazardous ? 1 : 0,
      evaluation.confidence,
      evaluation.evaluation_timestamp,
      evaluation.model_name,
      evaluation.comparison_to_baseline ? JSON.stringify(evaluation.comparison_to_baseline) : null
    ).run();

    return c.json({
      success: true,
      evaluation_id: evaluationId
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Delete evaluation
wmdpEvaluationsRoutes.delete('/', async (c) => {
  const db = c.env.DB;
  const evaluationId = c.req.query('evaluation_id');

  if (!evaluationId) {
    return c.json({ error: 'evaluation_id parameter required' }, 400);
  }

  try {
    await db.prepare('DELETE FROM wmdp_evaluations WHERE evaluation_id = ?')
      .bind(evaluationId)
      .run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
