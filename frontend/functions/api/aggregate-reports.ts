import { AggregateReport } from '../../types';
import { createAggregateReport, groupReportsByParameters } from '../../lib/aggregateReportCalculator';

/**
 * API endpoints for aggregate reports
 * POST /api/aggregate-reports - Create aggregate report
 * GET /api/aggregate-reports?conversation_id=X - List aggregates
 * GET /api/aggregate-reports/:aggregate_id - Get aggregate
 * POST /api/aggregate-reports/:aggregate_id/recompute - Recompute from source reports
 */

export async function onRequest(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(p => p);
  
  // Ensure aggregate_reports table exists
  await ensureTableExists(env.DB);
  
  if (request.method === 'POST') {
    if (pathParts.length === 4 && pathParts[3] === 'recompute') {
      // POST /api/aggregate-reports/:aggregate_id/recompute
      return handleRecompute(request, env.DB, pathParts[2]);
    } else {
      // POST /api/aggregate-reports
      return handlePost(request, env.DB);
    }
  } else if (request.method === 'GET') {
    if (pathParts.length === 3 && pathParts[2]) {
      // GET /api/aggregate-reports/:aggregate_id
      return handleGetSingle(env.DB, pathParts[2]);
    } else {
      // GET /api/aggregate-reports?conversation_id=X
      return handleGetList(request, env.DB);
    }
  } else {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Ensure aggregate_reports table exists
 */
async function ensureTableExists(db: any): Promise<void> {
  try {
    await db.prepare('SELECT 1 FROM aggregate_reports LIMIT 1').first();
  } catch (error: any) {
    if (error.message?.includes('no such table')) {
      console.warn('aggregate_reports table does not exist. Run schema migration.');
    }
  }
}

/**
 * POST /api/aggregate-reports - Create aggregate report
 */
async function handlePost(request: Request, db: any): Promise<Response> {
  try {
    const body = await request.json();
    const {
      source_report_ids,
      conversation_id,
      aggregate_type,
      aggregation_config
    } = body;
    
    if (!source_report_ids || !Array.isArray(source_report_ids) || source_report_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'source_report_ids array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!conversation_id || !aggregate_type) {
      return new Response(JSON.stringify({ error: 'conversation_id and aggregate_type required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Fetch source reports
    const reportStmt = db.prepare(`
      SELECT * FROM audit_reports
      WHERE report_id IN (${source_report_ids.map(() => '?').join(',')})
    `);
    
    const reportResults = await reportStmt.bind(...source_report_ids).all();
    const sourceReports = reportResults.results.map((row: any) => convertDbRowToReport(row));
    
    if (sourceReports.length === 0) {
      return new Response(JSON.stringify({ error: 'No source reports found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create aggregate report
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
    
    // Update computation duration
    aggregate.computation_duration_ms = computationDuration;
    await updateAggregateReport(db, aggregate);
    
    return new Response(JSON.stringify(aggregate), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error creating aggregate report:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to create aggregate report',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/aggregate-reports/:aggregate_id - Get single aggregate
 */
async function handleGetSingle(db: any, aggregateId: string): Promise<Response> {
  try {
    const stmt = db.prepare(`
      SELECT * FROM aggregate_reports
      WHERE aggregate_id = ?
    `);
    
    const row = await stmt.bind(aggregateId).first();
    
    if (!row) {
      return new Response(JSON.stringify({ error: 'Aggregate report not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const aggregate = convertDbRowToAggregate(row);
    
    return new Response(JSON.stringify(aggregate), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error fetching aggregate report:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch aggregate report',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/aggregate-reports?conversation_id=X - List aggregates
 */
async function handleGetList(request: Request, db: any): Promise<Response> {
  try {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversation_id');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    let query = 'SELECT * FROM aggregate_reports WHERE 1=1';
    const params: any[] = [];
    
    if (conversationId) {
      query += ' AND conversation_id = ?';
      params.push(conversationId);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    const results = await stmt.bind(...params).all();
    
    const aggregates = results.results.map((row: any) => convertDbRowToAggregate(row));
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM aggregate_reports WHERE 1=1';
    const countParams: any[] = [];
    
    if (conversationId) {
      countQuery += ' AND conversation_id = ?';
      countParams.push(conversationId);
    }
    
    const countStmt = db.prepare(countQuery);
    const countResult = await countStmt.bind(...countParams).first();
    const total = countResult?.count || 0;
    
    return new Response(JSON.stringify({
      aggregates,
      total,
      limit,
      offset
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error fetching aggregate reports:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch aggregate reports',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/aggregate-reports/:aggregate_id/recompute - Recompute aggregate
 */
async function handleRecompute(request: Request, db: any, aggregateId: string): Promise<Response> {
  try {
    // Get existing aggregate
    const getStmt = db.prepare('SELECT * FROM aggregate_reports WHERE aggregate_id = ?');
    const existing = await getStmt.bind(aggregateId).first();
    
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Aggregate report not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const existingAggregate = convertDbRowToAggregate(existing);
    
    // Fetch source reports
    const sourceReportIds = existingAggregate.source_report_ids;
    const reportStmt = db.prepare(`
      SELECT * FROM audit_reports
      WHERE report_id IN (${sourceReportIds.map(() => '?').join(',')})
    `);
    
    const reportResults = await reportStmt.bind(...sourceReportIds).all();
    const sourceReports = reportResults.results.map((row: any) => convertDbRowToReport(row));
    
    if (sourceReports.length === 0) {
      return new Response(JSON.stringify({ error: 'No source reports found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Recompute aggregate
    const recomputed = createAggregateReport(
      sourceReports,
      existingAggregate.aggregate_type,
      existingAggregate.conversation_id,
      existingAggregate.aggregation_config
    );
    
    // Update with same ID
    recomputed.aggregate_id = aggregateId;
    recomputed.created_at = existingAggregate.created_at; // Preserve original creation time
    
    const startTime = Date.now();
    await updateAggregateReport(db, recomputed);
    const computationDuration = Date.now() - startTime;
    
    recomputed.computation_duration_ms = computationDuration;
    await updateAggregateReport(db, recomputed);
    
    return new Response(JSON.stringify(recomputed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error recomputing aggregate report:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to recompute aggregate report',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Store aggregate report in database
 */
async function storeAggregateReport(db: any, aggregate: AggregateReport): Promise<void> {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO aggregate_reports (
      aggregate_id, conversation_id, aggregate_type,
      source_report_ids, source_count, aggregation_config,
      aggregated_score, score_distribution, parameter_effects,
      detected_types_aggregated, metrics_aggregated,
      created_at, created_by, computation_duration_ms, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  await stmt.bind(
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

/**
 * Update aggregate report in database
 */
async function updateAggregateReport(db: any, aggregate: AggregateReport): Promise<void> {
  const stmt = db.prepare(`
    UPDATE aggregate_reports SET
      aggregated_score = ?,
      score_distribution = ?,
      parameter_effects = ?,
      detected_types_aggregated = ?,
      metrics_aggregated = ?,
      computation_duration_ms = ?
    WHERE aggregate_id = ?
  `);
  
  await stmt.bind(
    aggregate.aggregated_score || null,
    aggregate.score_distribution ? JSON.stringify(aggregate.score_distribution) : null,
    aggregate.parameter_effects ? JSON.stringify(aggregate.parameter_effects) : null,
    aggregate.detected_types_aggregated ? JSON.stringify(aggregate.detected_types_aggregated) : null,
    aggregate.metrics_aggregated ? JSON.stringify(aggregate.metrics_aggregated) : null,
    aggregate.computation_duration_ms || null,
    aggregate.aggregate_id
  ).run();
}

/**
 * Convert database row to AggregateReport
 */
function convertDbRowToAggregate(row: any): AggregateReport {
  return {
    aggregate_id: row.aggregate_id,
    conversation_id: row.conversation_id,
    aggregate_type: row.aggregate_type as 'mean' | 'median' | 'parameter_effect' | 'time_series' | 'custom',
    source_report_ids: JSON.parse(row.source_report_ids),
    source_count: row.source_count,
    aggregation_config: JSON.parse(row.aggregation_config),
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

/**
 * Convert database row to AuditReport (helper for aggregate calculator)
 */
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

