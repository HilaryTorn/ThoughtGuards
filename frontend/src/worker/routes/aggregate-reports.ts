/**
 * Aggregate Reports API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const aggregateReportsRoutes = new Hono<{ Bindings: Env }>();

// Ensure aggregate_reports table exists
async function ensureTableExists(db: D1Database) {
  try {
    await db.prepare('SELECT 1 FROM aggregate_reports LIMIT 1').first();
  } catch (error: any) {
    if (error.message?.includes('no such table')) {
      console.warn('aggregate_reports table does not exist. Run schema migration.');
    }
  }
}

// Get aggregate reports
aggregateReportsRoutes.get('/', async (c) => {
  const db = c.env.DB;
  await ensureTableExists(db);

  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');
  const conversationId = c.req.query('conversation_id');

  try {
    let query = 'SELECT * FROM aggregate_reports WHERE 1=1';
    const params: any[] = [];

    if (conversationId) {
      query += ' AND conversation_id = ?';
      params.push(conversationId);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await db.prepare(query).bind(...params).all();
    const aggregates = (result.results || []).map(convertDbRowToAggregate);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM aggregate_reports WHERE 1=1';
    const countParams: any[] = [];

    if (conversationId) {
      countQuery += ' AND conversation_id = ?';
      countParams.push(conversationId);
    }

    const countResult = await db.prepare(countQuery).bind(...countParams).first<{ count: number }>();

    return c.json({
      aggregates,
      total: countResult?.count || 0,
      limit,
      offset
    });
  } catch (error: any) {
    console.error('Error fetching aggregate reports:', error);
    return c.json({ error: error.message || 'Failed to fetch aggregate reports' }, 500);
  }
});

// Get single aggregate
aggregateReportsRoutes.get('/:aggregateId', async (c) => {
  const db = c.env.DB;
  const aggregateId = c.req.param('aggregateId');

  try {
    const row = await db.prepare('SELECT * FROM aggregate_reports WHERE aggregate_id = ?')
      .bind(aggregateId)
      .first();

    if (!row) {
      return c.json({ error: 'Aggregate report not found' }, 404);
    }

    return c.json(convertDbRowToAggregate(row));
  } catch (error: any) {
    console.error('Error fetching aggregate report:', error);
    return c.json({ error: error.message || 'Failed to fetch aggregate report' }, 500);
  }
});

// Create aggregate report
aggregateReportsRoutes.post('/', async (c) => {
  const db = c.env.DB;
  await ensureTableExists(db);

  try {
    const body = await c.req.json();
    const {
      source_report_ids,
      conversation_id,
      aggregate_type,
      aggregation_config
    } = body;

    if (!source_report_ids || !Array.isArray(source_report_ids) || source_report_ids.length === 0) {
      return c.json({ error: 'source_report_ids array required' }, 400);
    }

    if (!conversation_id || !aggregate_type) {
      return c.json({ error: 'conversation_id and aggregate_type required' }, 400);
    }

    // Fetch source reports
    const placeholders = source_report_ids.map(() => '?').join(',');
    const reportResult = await db.prepare(
      `SELECT * FROM audit_reports WHERE report_id IN (${placeholders})`
    ).bind(...source_report_ids).all();

    const sourceReports = (reportResult.results || []).map((row: any) => ({
      ...row,
      overall_score: row.overall_score,
      metrics: row.metrics ? JSON.parse(row.metrics) : {},
      detected_types: row.detected_types ? JSON.parse(row.detected_types) : [],
      llm_parameters: row.llm_parameters ? JSON.parse(row.llm_parameters) : {}
    }));

    if (sourceReports.length === 0) {
      return c.json({ error: 'No source reports found' }, 404);
    }

    // Create aggregate
    const aggregate = createAggregateReport(
      sourceReports,
      aggregate_type,
      conversation_id,
      aggregation_config || { method: aggregate_type }
    );

    // Store in database
    const startTime = Date.now();
    await storeAggregateReport(db, aggregate);
    const computationDuration = Date.now() - startTime;

    aggregate.computation_duration_ms = computationDuration;
    await updateAggregateReport(db, aggregate);

    return c.json(aggregate, 201);
  } catch (error: any) {
    console.error('Error creating aggregate report:', error);
    return c.json({ error: error.message || 'Failed to create aggregate report' }, 500);
  }
});

// Recompute aggregate
aggregateReportsRoutes.post('/:aggregateId/recompute', async (c) => {
  const db = c.env.DB;
  const aggregateId = c.req.param('aggregateId');

  try {
    const existing = await db.prepare('SELECT * FROM aggregate_reports WHERE aggregate_id = ?')
      .bind(aggregateId)
      .first();

    if (!existing) {
      return c.json({ error: 'Aggregate report not found' }, 404);
    }

    const existingAggregate = convertDbRowToAggregate(existing);
    const sourceReportIds = existingAggregate.source_report_ids;

    // Fetch source reports
    const placeholders = sourceReportIds.map(() => '?').join(',');
    const reportResult = await db.prepare(
      `SELECT * FROM audit_reports WHERE report_id IN (${placeholders})`
    ).bind(...sourceReportIds).all();

    const sourceReports = (reportResult.results || []).map((row: any) => ({
      ...row,
      overall_score: row.overall_score,
      metrics: row.metrics ? JSON.parse(row.metrics) : {},
      detected_types: row.detected_types ? JSON.parse(row.detected_types) : [],
      llm_parameters: row.llm_parameters ? JSON.parse(row.llm_parameters) : {}
    }));

    if (sourceReports.length === 0) {
      return c.json({ error: 'No source reports found' }, 404);
    }

    // Recompute
    const recomputed = createAggregateReport(
      sourceReports,
      existingAggregate.aggregate_type,
      existingAggregate.conversation_id,
      existingAggregate.aggregation_config
    );

    recomputed.aggregate_id = aggregateId;
    recomputed.created_at = existingAggregate.created_at;

    const startTime = Date.now();
    await updateAggregateReport(db, recomputed);
    const computationDuration = Date.now() - startTime;

    recomputed.computation_duration_ms = computationDuration;
    await updateAggregateReport(db, recomputed);

    return c.json(recomputed);
  } catch (error: any) {
    console.error('Error recomputing aggregate report:', error);
    return c.json({ error: error.message || 'Failed to recompute aggregate report' }, 500);
  }
});

// Helper: Create aggregate report from source reports
function createAggregateReport(
  sourceReports: any[],
  aggregateType: string,
  conversationId: string,
  aggregationConfig: any
): any {
  const scores = sourceReports.map(r => r.overall_score).filter(s => s !== null && s !== undefined);

  // Calculate aggregated score based on type
  let aggregatedScore = 0;
  if (aggregateType === 'mean' || aggregateType === 'custom') {
    aggregatedScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  } else if (aggregateType === 'median') {
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    aggregatedScore = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Calculate score distribution
  const sortedScores = [...scores].sort((a, b) => a - b);
  const quantile = (p: number) => {
    const index = Math.floor((sortedScores.length - 1) * p);
    return sortedScores[index] || 0;
  };

  const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const variance = scores.length > 1
    ? scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1)
    : 0;

  return {
    aggregate_id: `agg-${conversationId}-${Date.now()}`,
    conversation_id: conversationId,
    aggregate_type: aggregateType,
    source_report_ids: sourceReports.map(r => r.report_id),
    source_count: sourceReports.length,
    aggregation_config: aggregationConfig,
    aggregated_score: aggregatedScore,
    score_distribution: {
      mean,
      stddev: Math.sqrt(variance),
      min: sortedScores[0] || 0,
      max: sortedScores[sortedScores.length - 1] || 0,
      quantiles: {
        p5: quantile(0.05),
        p25: quantile(0.25),
        p50: quantile(0.50),
        p75: quantile(0.75),
        p95: quantile(0.95)
      }
    },
    created_at: new Date().toISOString()
  };
}

// Helper: Store aggregate report
async function storeAggregateReport(db: D1Database, aggregate: any) {
  await db.prepare(`
    INSERT OR REPLACE INTO aggregate_reports (
      aggregate_id, conversation_id, aggregate_type,
      source_report_ids, source_count, aggregation_config,
      aggregated_score, score_distribution, parameter_effects,
      detected_types_aggregated, metrics_aggregated,
      created_at, created_by, computation_duration_ms, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    aggregate.aggregate_id,
    aggregate.conversation_id,
    aggregate.aggregate_type,
    JSON.stringify(aggregate.source_report_ids),
    aggregate.source_count,
    JSON.stringify(aggregate.aggregation_config),
    aggregate.aggregated_score || null,
    aggregate.score_distribution ? JSON.stringify(aggregate.score_distribution) : null,
    aggregate.parameter_effects ? JSON.stringify(aggregate.parameter_effects) : null,
    aggregate.detected_types_aggregated ? JSON.stringify(aggregate.detected_types_aggregated) : null,
    aggregate.metrics_aggregated ? JSON.stringify(aggregate.metrics_aggregated) : null,
    aggregate.created_at,
    aggregate.created_by || null,
    aggregate.computation_duration_ms || null,
    aggregate.notes || null
  ).run();
}

// Helper: Update aggregate report
async function updateAggregateReport(db: D1Database, aggregate: any) {
  await db.prepare(`
    UPDATE aggregate_reports SET
      aggregated_score = ?,
      score_distribution = ?,
      parameter_effects = ?,
      detected_types_aggregated = ?,
      metrics_aggregated = ?,
      computation_duration_ms = ?
    WHERE aggregate_id = ?
  `).bind(
    aggregate.aggregated_score || null,
    aggregate.score_distribution ? JSON.stringify(aggregate.score_distribution) : null,
    aggregate.parameter_effects ? JSON.stringify(aggregate.parameter_effects) : null,
    aggregate.detected_types_aggregated ? JSON.stringify(aggregate.detected_types_aggregated) : null,
    aggregate.metrics_aggregated ? JSON.stringify(aggregate.metrics_aggregated) : null,
    aggregate.computation_duration_ms || null,
    aggregate.aggregate_id
  ).run();
}

// Helper: Convert DB row to aggregate
function convertDbRowToAggregate(row: any): any {
  return {
    aggregate_id: row.aggregate_id,
    conversation_id: row.conversation_id,
    aggregate_type: row.aggregate_type,
    source_report_ids: JSON.parse(row.source_report_ids || '[]'),
    source_count: row.source_count,
    aggregation_config: JSON.parse(row.aggregation_config || '{}'),
    aggregated_score: row.aggregated_score || undefined,
    score_distribution: row.score_distribution ? JSON.parse(row.score_distribution) : undefined,
    parameter_effects: row.parameter_effects ? JSON.parse(row.parameter_effects) : undefined,
    detected_types_aggregated: row.detected_types_aggregated ? JSON.parse(row.detected_types_aggregated) : undefined,
    metrics_aggregated: row.metrics_aggregated ? JSON.parse(row.metrics_aggregated) : undefined,
    created_at: row.created_at,
    created_by: row.created_by || undefined,
    computation_duration_ms: row.computation_duration_ms || undefined,
    notes: row.notes || undefined
  };
}
