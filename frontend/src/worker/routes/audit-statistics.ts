/**
 * Audit Statistics API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const auditStatisticsRoutes = new Hono<{ Bindings: Env }>();

// Get distributional stats for a conversation
auditStatisticsRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const conversationId = c.req.query('conversation_id');

  if (!conversationId) {
    return c.json({ error: 'conversation_id parameter is required' }, 400);
  }

  try {
    // Ensure audit_runs table exists
    await ensureAuditRunsTable(db);

    const runsResult = await db.prepare(`
      SELECT
        run_id, audit_id, conversation_id, run_number,
        seed, temperature, model_name, overall_score,
        confidence, detected_types, metrics, created_at
      FROM audit_runs
      WHERE conversation_id = ?
      ORDER BY run_number
    `).bind(conversationId).all();

    if (!runsResult.results || runsResult.results.length === 0) {
      return c.json({
        conversation_id: conversationId,
        run_count: 0,
        statistics: null
      });
    }

    const runs = runsResult.results.map((row: any) => ({
      run_id: row.run_id,
      audit_id: row.audit_id,
      conversation_id: row.conversation_id,
      run_number: row.run_number,
      seed: row.seed,
      temperature: row.temperature,
      model_name: row.model_name,
      overall_score: row.overall_score,
      confidence: row.confidence,
      detected_types: JSON.parse(row.detected_types || '[]'),
      metrics: JSON.parse(row.metrics || '{}'),
      created_at: row.created_at
    }));

    const scores = runs.map(r => r.overall_score);
    const distribution = calculateDistribution(scores);
    const confidenceInterval = calculateConfidenceInterval(scores);

    return c.json({
      conversation_id: conversationId,
      run_count: runs.length,
      statistics: {
        mean: distribution.mean,
        stddev: distribution.stddev,
        variance: distribution.variance,
        min: distribution.min,
        max: distribution.max,
        quantiles: distribution.quantiles,
        confidenceInterval
      },
      runs: runs.map(r => ({
        run_id: r.run_id,
        run_number: r.run_number,
        overall_score: r.overall_score,
        confidence: r.confidence,
        seed: r.seed,
        temperature: r.temperature
      }))
    });
  } catch (error: any) {
    console.error('Error fetching audit statistics:', error);
    return c.json({ error: error.message || 'Failed to fetch audit statistics' }, 500);
  }
});

// Aggregate stats across conversations
auditStatisticsRoutes.get('/aggregate', async (c) => {
  const db = c.env.DB;
  const category = c.req.query('category');
  const model = c.req.query('model');
  const limit = parseInt(c.req.query('limit') || '1000');

  try {
    let query = `
      SELECT
        ar.conversation_id,
        ar.overall_score,
        ar.score_mean,
        ar.score_stddev,
        ar.primary_category,
        ar.model_name
      FROM audit_results ar
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category) {
      query += ' AND ar.primary_category = ?';
      params.push(category);
    }

    if (model) {
      query += ' AND ar.model_name = ?';
      params.push(model);
    }

    query += ' ORDER BY ar.created_at DESC LIMIT ?';
    params.push(limit);

    const result = await db.prepare(query).bind(...params).all();

    if (!result.results || result.results.length === 0) {
      return c.json({
        total: 0,
        statistics: null,
        by_category: {}
      });
    }

    const scores = result.results
      .map((r: any) => r.score_mean !== null ? r.score_mean : r.overall_score)
      .filter((s: number) => s !== null && s !== undefined);

    if (scores.length === 0) {
      return c.json({
        total: result.results.length,
        statistics: null,
        by_category: {}
      });
    }

    // Group by category
    const byCategory: Record<string, number[]> = {};
    result.results.forEach((r: any) => {
      const cat = r.primary_category || 'unknown';
      const score = r.score_mean !== null ? r.score_mean : r.overall_score;
      if (score !== null && score !== undefined) {
        if (!byCategory[cat]) {
          byCategory[cat] = [];
        }
        byCategory[cat].push(score);
      }
    });

    const overallStats = calculateDistribution(scores);

    const categoryStats: Record<string, any> = {};
    for (const [cat, catScores] of Object.entries(byCategory)) {
      if (catScores.length > 0) {
        const catStats = calculateDistribution(catScores);
        categoryStats[cat] = {
          count: catScores.length,
          mean: catStats.mean,
          stddev: catStats.stddev,
          quantiles: catStats.quantiles
        };
      }
    }

    return c.json({
      total: result.results.length,
      statistics: {
        mean: overallStats.mean,
        stddev: overallStats.stddev,
        quantiles: overallStats.quantiles
      },
      by_category: categoryStats
    });
  } catch (error: any) {
    console.error('Error calculating aggregate statistics:', error);
    return c.json({ error: error.message || 'Failed to calculate aggregate statistics' }, 500);
  }
});

// Calibration metrics vs ground truth
auditStatisticsRoutes.get('/calibration', async (c) => {
  const db = c.env.DB;

  try {
    const result = await db.prepare(`
      SELECT
        ar.conversation_id,
        ar.overall_score,
        ar.score_mean,
        gtl.is_manipulation
      FROM audit_results ar
      INNER JOIN ground_truth_labels gtl ON ar.conversation_id = gtl.conversation_id
      WHERE ar.score_mean IS NOT NULL OR ar.overall_score IS NOT NULL
    `).all();

    if (!result.results || result.results.length === 0) {
      return c.json({
        total: 0,
        calibration: null,
        message: 'No audit results with ground truth labels found'
      });
    }

    const predictions: number[] = [];
    const groundTruth: boolean[] = [];

    result.results.forEach((row: any) => {
      const score = row.score_mean !== null ? row.score_mean : row.overall_score;
      if (score !== null && score !== undefined) {
        predictions.push(score);
        groundTruth.push(row.is_manipulation === 1);
      }
    });

    if (predictions.length === 0) {
      return c.json({
        total: 0,
        calibration: null,
        message: 'No valid predictions found'
      });
    }

    const thresholds = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const calibrationAtThresholds = thresholds.map(threshold => {
      const metrics = calculateCalibrationMetrics(predictions, groundTruth, threshold);
      return { threshold, ...metrics };
    });

    const overallCalibration = calculateCalibrationMetrics(predictions, groundTruth, 0.5);

    return c.json({
      total: predictions.length,
      calibration: {
        overall: overallCalibration,
        by_threshold: calibrationAtThresholds
      }
    });
  } catch (error: any) {
    console.error('Error calculating calibration metrics:', error);
    return c.json({ error: error.message || 'Failed to calculate calibration metrics' }, 500);
  }
});

// Get all runs for an audit
auditStatisticsRoutes.get('/runs', async (c) => {
  const db = c.env.DB;
  const auditId = c.req.query('audit_id');

  if (!auditId) {
    return c.json({ error: 'audit_id parameter is required' }, 400);
  }

  try {
    await ensureAuditRunsTable(db);

    const result = await db.prepare(`
      SELECT
        run_id, audit_id, conversation_id, run_number,
        seed, temperature, model_name, overall_score,
        confidence, detected_types, metrics, created_at
      FROM audit_runs
      WHERE audit_id = ?
      ORDER BY run_number
    `).bind(auditId).all();

    const runs = (result.results || []).map((row: any) => ({
      run_id: row.run_id,
      audit_id: row.audit_id,
      conversation_id: row.conversation_id,
      run_number: row.run_number,
      seed: row.seed,
      temperature: row.temperature,
      model_name: row.model_name,
      overall_score: row.overall_score,
      confidence: row.confidence,
      detected_types: JSON.parse(row.detected_types || '[]'),
      metrics: JSON.parse(row.metrics || '{}'),
      created_at: row.created_at
    }));

    return c.json({ runs });
  } catch (error: any) {
    console.error('Error fetching audit runs:', error);
    return c.json({ error: error.message || 'Failed to fetch audit runs' }, 500);
  }
});

// Helper: Ensure audit_runs table exists
async function ensureAuditRunsTable(db: D1Database) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS audit_runs (
        run_id TEXT PRIMARY KEY,
        audit_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        run_number INTEGER NOT NULL,
        seed INTEGER,
        temperature REAL,
        model_name TEXT NOT NULL,
        overall_score REAL NOT NULL,
        confidence TEXT NOT NULL,
        detected_types TEXT,
        metrics TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (audit_id) REFERENCES audit_results(audit_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
      )
    `).run();
  } catch (error: any) {
    console.warn('Failed to ensure audit_runs table exists:', error);
  }
}

// Helper: Calculate distribution statistics
function calculateDistribution(scores: number[]) {
  if (scores.length === 0) {
    return { mean: 0, stddev: 0, variance: 0, min: 0, max: 0, quantiles: {} };
  }

  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const variance = scores.length > 1
    ? scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1)
    : 0;
  const stddev = Math.sqrt(variance);

  const sorted = [...scores].sort((a, b) => a - b);
  const quantile = (p: number) => {
    const index = Math.floor((sorted.length - 1) * p);
    return sorted[index];
  };

  return {
    mean,
    stddev,
    variance,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    quantiles: {
      p5: quantile(0.05),
      p25: quantile(0.25),
      p50: quantile(0.50),
      p75: quantile(0.75),
      p95: quantile(0.95)
    }
  };
}

// Helper: Calculate confidence interval
function calculateConfidenceInterval(scores: number[], confidence = 0.95) {
  if (scores.length < 2) {
    return { lower: scores[0] || 0, upper: scores[0] || 0 };
  }

  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const stddev = Math.sqrt(
    scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1)
  );

  // Z-score for 95% confidence
  const z = 1.96;
  const margin = z * (stddev / Math.sqrt(scores.length));

  return {
    lower: mean - margin,
    upper: mean + margin
  };
}

// Helper: Calculate calibration metrics
function calculateCalibrationMetrics(predictions: number[], groundTruth: boolean[], threshold: number) {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (let i = 0; i < predictions.length; i++) {
    const predicted = predictions[i] >= threshold;
    const actual = groundTruth[i];

    if (predicted && actual) tp++;
    else if (predicted && !actual) fp++;
    else if (!predicted && !actual) tn++;
    else fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  const accuracy = (tp + tn) / predictions.length;

  return { precision, recall, f1, accuracy, tp, fp, tn, fn };
}
