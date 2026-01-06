import { createDbClient } from '../../lib/db';
import { calculateDistribution, calculateConfidenceInterval, calculateCalibrationMetrics, AuditRun } from '../../lib/statisticalAnalysis';

export const onRequest: PagesFunction<{ DB: D1Database }> = async (context) => {
  const { request, env } = context;
  const db = createDbClient(env.DB);

  // Ensure tables exist
  try {
    await env.DB.prepare(`
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

  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/audit-statistics' && request.method === 'GET') {
    // Get distributional stats for a conversation
    const conversationId = url.searchParams.get('conversation_id');
    
    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: 'conversation_id parameter is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      // Get all runs for this conversation
      const runsResult = await env.DB.prepare(`
        SELECT 
          run_id, audit_id, conversation_id, run_number,
          seed, temperature, model_name, overall_score,
          confidence, detected_types, metrics, created_at
        FROM audit_runs
        WHERE conversation_id = ?
        ORDER BY run_number
      `).bind(conversationId).all();

      if (!runsResult.results || runsResult.results.length === 0) {
        // No runs found, return empty stats
        return new Response(
          JSON.stringify({
            conversation_id: conversationId,
            run_count: 0,
            statistics: null
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const runs: AuditRun[] = runsResult.results.map((row: any) => ({
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

      const distribution = calculateDistribution(runs);
      const scores = runs.map(r => r.overall_score);
      const confidenceInterval = calculateConfidenceInterval(scores);

      return new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      console.error('Error fetching audit statistics:', error);
      return new Response(
        JSON.stringify({ error: error.message || 'Failed to fetch audit statistics' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else if (path === '/api/audit-statistics/aggregate' && request.method === 'GET') {
    // Aggregate stats across conversations
    const category = url.searchParams.get('category');
    const model = url.searchParams.get('model');
    const limit = parseInt(url.searchParams.get('limit') || '1000');

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

      const result = await env.DB.prepare(query).bind(...params).all();

      if (!result.results || result.results.length === 0) {
        return new Response(
          JSON.stringify({
            total: 0,
            statistics: null,
            by_category: {}
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Calculate aggregate statistics
      const scores = result.results
        .map((r: any) => r.score_mean !== null ? r.score_mean : r.overall_score)
        .filter((s: number) => s !== null && s !== undefined);

      if (scores.length === 0) {
        return new Response(
          JSON.stringify({
            total: result.results.length,
            statistics: null,
            by_category: {}
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
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

      // Calculate overall statistics
      const mean = scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length;
      const variance = scores.reduce((sum: number, s: number) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1);
      const stddev = Math.sqrt(variance);
      
      scores.sort((a, b) => a - b);
      const quantile = (p: number) => {
        const index = Math.floor((scores.length - 1) * p);
        return scores[index];
      };

      const categoryStats: Record<string, any> = {};
      for (const [cat, catScores] of Object.entries(byCategory)) {
        if (catScores.length > 0) {
          const catMean = catScores.reduce((sum: number, s: number) => sum + s, 0) / catScores.length;
          const catVariance = catScores.reduce((sum: number, s: number) => sum + Math.pow(s - catMean, 2), 0) / (catScores.length - 1);
          const catStddev = Math.sqrt(catVariance);
          catScores.sort((a: number, b: number) => a - b);
          const catQuantile = (p: number) => {
            const index = Math.floor((catScores.length - 1) * p);
            return catScores[index];
          };

          categoryStats[cat] = {
            count: catScores.length,
            mean: catMean,
            stddev: catStddev,
            quantiles: {
              p5: catQuantile(0.05),
              p50: catQuantile(0.50),
              p95: catQuantile(0.95)
            }
          };
        }
      }

      return new Response(
        JSON.stringify({
          total: result.results.length,
          statistics: {
            mean,
            stddev,
            quantiles: {
              p5: quantile(0.05),
              p50: quantile(0.50),
              p95: quantile(0.95)
            }
          },
          by_category: categoryStats
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      console.error('Error calculating aggregate statistics:', error);
      return new Response(
        JSON.stringify({ error: error.message || 'Failed to calculate aggregate statistics' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else if (path === '/api/audit-statistics/calibration' && request.method === 'GET') {
    // Calibration metrics vs ground truth
    try {
      // Get audit results with ground truth labels
      const result = await env.DB.prepare(`
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
        return new Response(
          JSON.stringify({
            total: 0,
            calibration: null,
            message: 'No audit results with ground truth labels found'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
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
        return new Response(
          JSON.stringify({
            total: 0,
            calibration: null,
            message: 'No valid predictions found'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Calculate calibration at different thresholds
      const thresholds = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
      const calibrationAtThresholds = thresholds.map(threshold => {
        const metrics = calculateCalibrationMetrics(predictions, groundTruth, threshold);
        return {
          threshold,
          ...metrics
        };
      });

      // Overall calibration (using 0.5 threshold)
      const overallCalibration = calculateCalibrationMetrics(predictions, groundTruth, 0.5);

      return new Response(
        JSON.stringify({
          total: predictions.length,
          calibration: {
            overall: overallCalibration,
            by_threshold: calibrationAtThresholds
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      console.error('Error calculating calibration metrics:', error);
      return new Response(
        JSON.stringify({ error: error.message || 'Failed to calculate calibration metrics' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else if (path === '/api/audit-statistics/runs' && request.method === 'GET') {
    // Get all runs for an audit
    const auditId = url.searchParams.get('audit_id');
    
    if (!auditId) {
      return new Response(
        JSON.stringify({ error: 'audit_id parameter is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      const result = await env.DB.prepare(`
        SELECT 
          run_id, audit_id, conversation_id, run_number,
          seed, temperature, model_name, overall_score,
          confidence, detected_types, metrics, created_at
        FROM audit_runs
        WHERE audit_id = ?
        ORDER BY run_number
      `).bind(auditId).all();

      if (!result.results) {
        return new Response(
          JSON.stringify({ runs: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const runs = result.results.map((row: any) => ({
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

      return new Response(
        JSON.stringify({ runs }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      console.error('Error fetching audit runs:', error);
      return new Response(
        JSON.stringify({ error: error.message || 'Failed to fetch audit runs' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    return new Response(
      JSON.stringify({ error: 'Method not allowed or invalid endpoint' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

