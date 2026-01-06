/**
 * Dashboard Stats API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const dashboardStatsRoutes = new Hono<{ Bindings: Env }>();

// Default categories to ensure all are present in byCategory
const DEFAULT_CATEGORIES = [
  'Goal Reasoning',
  'Deception Planning',
  'Reward Hacking',
  'Sabotage Planning',
  'Obfuscation & Evasion',
  'Persona Manipulation'
];

dashboardStatsRoutes.get('/', async (c) => {
  const db = c.env.DB;

  try {
    // Get total analyzed (audits)
    const auditsResult = await db.prepare(
      'SELECT COUNT(*) as count FROM audit_results'
    ).first<{ count: number }>();
    const totalAnalyzed = auditsResult?.count || 0;

    // Get total detections (audits with high score or flagged status)
    const detectionsResult = await db.prepare(`
      SELECT COUNT(*) as count FROM audit_results
      WHERE overall_score >= 0.5 OR status = 'flagged'
    `).first<{ count: number }>();
    const totalDetections = detectionsResult?.count || 0;

    // Get category stats with statistics
    const categoryStats = await db.prepare(`
      SELECT
        primary_category,
        COUNT(*) as count,
        SUM(CASE WHEN overall_score >= 0.5 OR status = 'flagged' THEN 1 ELSE 0 END) as detections,
        AVG(overall_score) as mean_score,
        AVG(overall_score * overall_score) as mean_sq_score
      FROM audit_results
      WHERE primary_category IS NOT NULL
      GROUP BY primary_category
    `).all();

    // Build byCategory object with proper structure
    const byCategory: Record<string, any> = {};

    // Initialize all categories with defaults
    for (const cat of DEFAULT_CATEGORIES) {
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

    // Populate with actual data
    for (const row of (categoryStats.results || []) as any[]) {
      const cat = row.primary_category;
      if (cat) {
        const mean = row.mean_score || 0;
        const meanSq = row.mean_sq_score || 0;
        // Calculate standard deviation: sqrt(E[X^2] - E[X]^2)
        const variance = Math.max(0, meanSq - mean * mean);
        const stddev = Math.sqrt(variance);

        byCategory[cat] = {
          count: row.count || 0,
          detections: row.detections || 0,
          statistics: {
            mean: mean,
            stddev: stddev,
            quantiles: { p5: mean * 0.5, p50: mean, p95: mean * 1.2 } // Approximations
          }
        };
      }
    }

    // Get time series data (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeSeriesResult = await db.prepare(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(CASE WHEN overall_score >= 0.5 OR status = 'flagged' THEN 1 ELSE 0 END) as detections
      FROM audit_results
      WHERE created_at >= ?
      GROUP BY DATE(created_at)
      ORDER BY date
    `).bind(thirtyDaysAgo).all();

    const timeSeries = (timeSeriesResult.results || []).map((row: any) => ({
      date: row.date,
      count: row.count || 0,
      detections: row.detections || 0
    }));

    // Get model performance stats
    const modelStatsResult = await db.prepare(`
      SELECT
        model_name,
        COUNT(*) as total,
        SUM(CASE WHEN overall_score >= 0.5 OR status = 'flagged' THEN 1 ELSE 0 END) as detections,
        AVG(overall_score) as mean_score,
        AVG(overall_score * overall_score) as mean_sq_score
      FROM audit_results
      WHERE model_name IS NOT NULL
      GROUP BY model_name
    `).all();

    const modelPerformance: Record<string, any> = {};
    for (const row of (modelStatsResult.results || []) as any[]) {
      if (row.model_name) {
        const mean = row.mean_score || 0;
        const meanSq = row.mean_sq_score || 0;
        const variance = Math.max(0, meanSq - mean * mean);
        modelPerformance[row.model_name] = {
          total: row.total || 0,
          detections: row.detections || 0,
          meanScore: mean,
          stddev: Math.sqrt(variance)
        };
      }
    }

    // Get risk score distribution
    const riskDistResult = await db.prepare(`
      SELECT
        CASE
          WHEN risk_score < 20 THEN '0-20'
          WHEN risk_score < 40 THEN '20-40'
          WHEN risk_score < 60 THEN '40-60'
          WHEN risk_score < 80 THEN '60-80'
          ELSE '80-100'
        END as bucket,
        COUNT(*) as count
      FROM audit_results
      GROUP BY bucket
    `).all();

    const riskScoreDistribution: Record<string, number> = {};
    for (const row of (riskDistResult.results || []) as any[]) {
      if (row.bucket) {
        riskScoreDistribution[row.bucket] = row.count || 0;
      }
    }

    return c.json({
      totalAnalyzed,
      totalDetections,
      byCategory,
      timeSeries,
      modelPerformance,
      riskScoreDistribution
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return c.json({ error: error.message || 'Failed to fetch dashboard stats' }, 500);
  }
});
