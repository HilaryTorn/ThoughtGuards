import { AuditReport, LLMParameters } from '../../types';

/**
 * API endpoints for managing audit reports
 * POST /api/audit-reports - Create single report
 * GET /api/audit-reports?conversation_id=X - List reports for conversation
 * GET /api/audit-reports/:report_id - Get single report
 * DELETE /api/audit-reports/:report_id - Delete report
 * PUT /api/audit-reports/:report_id - Update report (tags, notes)
 */

export async function onRequest(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(p => p);
  
  // Ensure audit_reports table exists
  await ensureTableExists(env.DB);
  
  if (request.method === 'POST') {
    return handlePost(request, env.DB);
  } else if (request.method === 'GET') {
    if (pathParts.length === 3 && pathParts[2]) {
      // GET /api/audit-reports/:report_id
      return handleGetSingle(request, env.DB, pathParts[2]);
    } else {
      // GET /api/audit-reports?conversation_id=X
      return handleGetList(request, env.DB);
    }
  } else if (request.method === 'PUT') {
    if (pathParts.length === 3 && pathParts[2]) {
      return handlePut(request, env.DB, pathParts[2]);
    } else {
      return new Response(JSON.stringify({ error: 'Report ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else if (request.method === 'DELETE') {
    if (pathParts.length === 3 && pathParts[2]) {
      return handleDelete(env.DB, pathParts[2]);
    } else {
      return new Response(JSON.stringify({ error: 'Report ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Ensure audit_reports table exists
 */
async function ensureTableExists(db: any): Promise<void> {
  try {
    // Try to query the table
    await db.prepare('SELECT 1 FROM audit_reports LIMIT 1').first();
  } catch (error: any) {
    // Table doesn't exist, create it
    if (error.message?.includes('no such table')) {
      // Table creation should be handled by schema.sql migration
      // For now, just log the error
      console.warn('audit_reports table does not exist. Run schema migration.');
    }
  }
}

/**
 * POST /api/audit-reports - Create single report
 */
async function handlePost(request: Request, db: any): Promise<Response> {
  try {
    const report: AuditReport = await request.json();
    
    // Validate required fields
    if (!report.report_id || !report.conversation_id || !report.skill_id) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: report_id, conversation_id, skill_id' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Insert report
    const stmt = db.prepare(`
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
        detection_metadata, conversation_snapshot, tags, notes, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
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
      JSON.stringify(report.conversation_snapshot),
      report.tags ? JSON.stringify(report.tags) : null,
      report.notes || null,
      report.error_message || null
    ).run();
    
    return new Response(JSON.stringify({ 
      success: true,
      report_id: report.report_id 
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error creating report:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to create report',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/audit-reports/:report_id - Get single report
 */
async function handleGetSingle(request: Request, db: any, reportId: string): Promise<Response> {
  try {
    const stmt = db.prepare(`
      SELECT * FROM audit_reports
      WHERE report_id = ?
    `);
    
    const row = await stmt.bind(reportId).first();
    
    if (!row) {
      return new Response(JSON.stringify({ error: 'Report not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const report = convertDbRowToReport(row);
    
    return new Response(JSON.stringify(report), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error fetching report:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch report',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/audit-reports?conversation_id=X - List reports for conversation
 */
async function handleGetList(request: Request, db: any): Promise<Response> {
  try {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversation_id');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const skillId = url.searchParams.get('skill_id');
    const modelName = url.searchParams.get('model_name');
    
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
    
    const stmt = db.prepare(query);
    const results = await stmt.bind(...params).all();
    
    const reports = results.results.map((row: any) => convertDbRowToReport(row));
    
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
    
    const countStmt = db.prepare(countQuery);
    const countResult = await countStmt.bind(...countParams).first();
    const total = countResult?.count || 0;
    
    return new Response(JSON.stringify({
      reports,
      total,
      limit,
      offset
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error fetching reports:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch reports',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * PUT /api/audit-reports/:report_id - Update report (tags, notes)
 */
async function handlePut(request: Request, db: any, reportId: string): Promise<Response> {
  try {
    const body = await request.json();
    
    // Only allow updating tags and notes
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
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    params.push(reportId);
    
    const query = `UPDATE audit_reports SET ${updates.join(', ')} WHERE report_id = ?`;
    const stmt = db.prepare(query);
    await stmt.bind(...params).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error updating report:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to update report',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * DELETE /api/audit-reports/:report_id - Delete report
 */
async function handleDelete(db: any, reportId: string): Promise<Response> {
  try {
    const stmt = db.prepare('DELETE FROM audit_reports WHERE report_id = ?');
    await stmt.bind(reportId).run();
    
    // Also delete from cache
    const cacheStmt = db.prepare('DELETE FROM report_cache WHERE report_id = ?');
    await cacheStmt.bind(reportId).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error deleting report:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to delete report',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
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

