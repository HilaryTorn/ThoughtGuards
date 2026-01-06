/**
 * API endpoint for WMDP Benchmark evaluations
 * 
 * Handles storage and retrieval of WMDP evaluation results
 */

import { WMDPEvaluationResult } from '../../types';

export async function onRequest(context: any) {
  const { request, env } = context;
  const { method } = request;
  const url = new URL(request.url);
  
  // Ensure wmdp_evaluations table exists
  try {
    await env.DB.exec(`
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
  
  if (method === 'POST') {
    try {
      const body = await request.json();
      const evaluation: WMDPEvaluationResult = body;
      
      // Generate evaluation ID
      const evaluationId = `wmdp_${evaluation.question_id}_${evaluation.model_name}_${Date.now()}`;
      
      // Store evaluation
      await env.DB.prepare(`
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
      
      return new Response(JSON.stringify({
        success: true,
        evaluation_id: evaluationId
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({
        error: error.message
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  if (method === 'GET') {
    try {
      const questionId = url.searchParams.get('question_id');
      const category = url.searchParams.get('category');
      const modelName = url.searchParams.get('model_name');
      const limit = parseInt(url.searchParams.get('limit') || '1000');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      
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
      
      const stmt = env.DB.prepare(query);
      if (params.length > 0) {
        stmt.bind(...params);
      }
      
      const result = await stmt.all();
      
      // Convert to WMDPEvaluationResult format
      const evaluations: WMDPEvaluationResult[] = result.results.map((row: any) => ({
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
      
      const countStmt = env.DB.prepare(countQuery);
      if (countParams.length > 0) {
        countStmt.bind(...countParams);
      }
      const countResult = await countStmt.first();
      const total = countResult?.total || 0;
      
      return new Response(JSON.stringify({
        evaluations,
        total,
        limit,
        offset
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  if (method === 'DELETE') {
    try {
      const evaluationId = url.searchParams.get('evaluation_id');
      
      if (!evaluationId) {
        return new Response(JSON.stringify({
          error: 'evaluation_id parameter required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      await env.DB.prepare('DELETE FROM wmdp_evaluations WHERE evaluation_id = ?')
        .bind(evaluationId)
        .run();
      
      return new Response(JSON.stringify({
        success: true
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  return new Response(JSON.stringify({
    error: 'Method not allowed'
  }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}

