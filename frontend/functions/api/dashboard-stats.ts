import { createDbClient } from '../../lib/db';

export const onRequest: PagesFunction<{ DB: D1Database }> = async (context) => {
  const { request, env } = context;
  const db = createDbClient(env.DB);

  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const model = url.searchParams.get('model');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const limit = parseInt(url.searchParams.get('limit') || '10000');

    // Check if statistical columns exist
    let hasStatisticalColumns = false;
    try {
      const testQuery = await env.DB.prepare(`SELECT run_count FROM audit_results LIMIT 1`).first();
      hasStatisticalColumns = true;
    } catch (e: any) {
      hasStatisticalColumns = false;
    }

    // Build query for audit results
    let query = `
      SELECT 
        ar.conversation_id,
        ar.overall_score,
        ar.score_mean,
        ar.score_stddev,
        ar.score_p5,
        ar.score_p50,
        ar.score_p95,
        ar.primary_category,
        ar.model_name,
        ar.status,
        ar.risk_score,
        ar.created_at,
        ar.run_count
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

    if (dateFrom) {
      query += ' AND ar.created_at >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ' AND ar.created_at <= ?';
      params.push(dateTo);
    }

    query += ' ORDER BY ar.created_at DESC LIMIT ?';
    params.push(limit);

    const result = await env.DB.prepare(query).bind(...params).all();

    if (!result.results || result.results.length === 0) {
      return new Response(
        JSON.stringify({
          totalAnalyzed: 0,
          totalDetections: 0,
          byCategory: {},
          timeSeries: [],
          modelPerformance: {},
          riskScoreDistribution: {}
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results = result.results as any[];

    // Calculate total analyzed
    const totalAnalyzed = results.length;

    // Calculate total detections (flagged, review, confirmed)
    const totalDetections = results.filter(r => 
      r.status === 'flagged' || r.status === 'review' || r.status === 'confirmed'
    ).length;

    // Group by category with statistical metrics
    const byCategory: Record<string, {
      count: number;
      detections: number;
      statistics: {
        mean: number;
        stddev: number;
        quantiles: { p5: number; p50: number; p95: number };
      };
    }> = {};

    results.forEach((r: any) => {
      const cat = r.primary_category || 'unknown';
      if (!byCategory[cat]) {
        byCategory[cat] = {
          count: 0,
          detections: 0,
          statistics: {
            mean: 0,
            stddev: 0,
            quantiles: { p5: 0, p50: 0, p95: 0 }
          }
        };
      }
      byCategory[cat].count++;
      if (r.status === 'flagged' || r.status === 'review' || r.status === 'confirmed') {
        byCategory[cat].detections++;
      }
    });

    // Calculate statistics per category
    for (const [cat, data] of Object.entries(byCategory)) {
      const catResults = results.filter((r: any) => (r.primary_category || 'unknown') === cat);
      const scores = catResults
        .map((r: any) => r.score_mean !== null ? r.score_mean : r.overall_score)
        .filter((s: number) => s !== null && s !== undefined) as number[];

      if (scores.length > 0) {
        const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1);
        const stddev = Math.sqrt(variance);
        
        scores.sort((a, b) => a - b);
        const quantile = (p: number) => {
          const index = Math.floor((scores.length - 1) * p);
          return scores[index];
        };

        data.statistics = {
          mean,
          stddev,
          quantiles: {
            p5: quantile(0.05),
            p50: quantile(0.50),
            p95: quantile(0.95)
          }
        };
      }
    }

    // Time series data (detections over time)
    const timeSeriesMap = new Map<string, { date: string; count: number; detections: number }>();
    
    results.forEach((r: any) => {
      const date = r.created_at ? r.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
      if (!timeSeriesMap.has(date)) {
        timeSeriesMap.set(date, { date, count: 0, detections: 0 });
      }
      const entry = timeSeriesMap.get(date)!;
      entry.count++;
      if (r.status === 'flagged' || r.status === 'review' || r.status === 'confirmed') {
        entry.detections++;
      }
    });

    const timeSeries = Array.from(timeSeriesMap.values())
      .sort((a, b) => a.date.localeCompare(b.date));

    // Model performance comparison
    const modelPerformance: Record<string, {
      total: number;
      detections: number;
      meanScore: number;
      stddev: number;
    }> = {};

    results.forEach((r: any) => {
      const model = r.model_name || 'unknown';
      if (!modelPerformance[model]) {
        modelPerformance[model] = {
          total: 0,
          detections: 0,
          meanScore: 0,
          stddev: 0
        };
      }
      modelPerformance[model].total++;
      if (r.status === 'flagged' || r.status === 'review' || r.status === 'confirmed') {
        modelPerformance[model].detections++;
      }
    });

    // Calculate statistics per model
    for (const [model, data] of Object.entries(modelPerformance)) {
      const modelResults = results.filter((r: any) => (r.model_name || 'unknown') === model);
      const scores = modelResults
        .map((r: any) => r.score_mean !== null ? r.score_mean : r.overall_score)
        .filter((s: number) => s !== null && s !== undefined) as number[];

      if (scores.length > 0) {
        const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1);
        const stddev = Math.sqrt(variance);
        
        data.meanScore = mean;
        data.stddev = stddev;
      }
    }

    // Risk score distribution
    const riskScoreDistribution: Record<string, number> = {};
    results.forEach((r: any) => {
      const riskLevel = r.risk_score < 30 ? 'low' : r.risk_score < 70 ? 'medium' : 'high';
      riskScoreDistribution[riskLevel] = (riskScoreDistribution[riskLevel] || 0) + 1;
    });

    return new Response(
      JSON.stringify({
        totalAnalyzed,
        totalDetections,
        byCategory,
        timeSeries,
        modelPerformance,
        riskScoreDistribution
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to fetch dashboard stats' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

