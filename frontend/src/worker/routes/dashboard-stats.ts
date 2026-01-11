/**
 * Dashboard Stats API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const dashboardStatsRoutes = new Hono<{ Bindings: Env }>();

// Default categories (HOW verbs from taxonomy)
const DEFAULT_CATEGORIES = [
  'Fabricated',      // H1
  'Sandbagged',      // H2
  'Context-Switched', // H3
  'Pressured',       // H4
  'Hid',             // H5
  'Overclaimed'      // H6
];

// Map HOW codes to category names
const HOW_CODE_MAP: Record<string, string> = {
  'H1': 'Fabricated',
  'H2': 'Sandbagged',
  'H3': 'Context-Switched',
  'H4': 'Pressured',
  'H5': 'Hid',
  'H6': 'Overclaimed',
};

dashboardStatsRoutes.get('/', async (c) => {
  const db = c.env.DB;

  try {
    // Get total analyzed (audits)
    const auditsResult = await db.prepare(
      'SELECT COUNT(*) as count FROM audit_reports'
    ).first<{ count: number }>();
    const totalAnalyzed = auditsResult?.count || 0;

    // Get total detections (audits with patterns that have severity > 0)
    const detectionsResult = await db.prepare(`
      SELECT COUNT(*) as count FROM audit_reports
      WHERE patterns IS NOT NULL
        AND patterns != '[]'
        AND json_array_length(patterns) > 0
    `).first<{ count: number }>();
    const totalDetections = detectionsResult?.count || 0;

    // Get category stats with statistics (using pattern existence for detection)
    const categoryStats = await db.prepare(`
      SELECT
        primary_category,
        COUNT(*) as count,
        SUM(CASE WHEN json_array_length(patterns) > 0 THEN 1 ELSE 0 END) as detections
      FROM audit_reports
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

    // Populate with actual data, normalizing HOW codes to category names
    for (const row of (categoryStats.results || []) as any[]) {
      let cat = row.primary_category;
      if (cat) {
        // Normalize HOW codes (H1, H2, etc.) to category names
        if (HOW_CODE_MAP[cat]) {
          cat = HOW_CODE_MAP[cat];
        }

        // Accumulate counts if category already exists (handles both H3 and Context-Switched mapping to same)
        const existing = byCategory[cat] || { count: 0, detections: 0, statistics: { mean: 0, stddev: 0, quantiles: { p5: 0, p50: 0, p95: 0 } } };
        byCategory[cat] = {
          count: existing.count + (row.count || 0),
          detections: existing.detections + (row.detections || 0),
          statistics: {
            mean: 0,
            stddev: 0,
            quantiles: { p5: 0, p50: 0, p95: 0 }
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
        SUM(CASE WHEN json_array_length(patterns) > 0 THEN 1 ELSE 0 END) as detections
      FROM audit_reports
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
        SUM(CASE WHEN json_array_length(patterns) > 0 THEN 1 ELSE 0 END) as detections
      FROM audit_reports
      WHERE model_name IS NOT NULL
      GROUP BY model_name
    `).all();

    const modelPerformance: Record<string, any> = {};
    for (const row of (modelStatsResult.results || []) as any[]) {
      if (row.model_name) {
        modelPerformance[row.model_name] = {
          total: row.total || 0,
          detections: row.detections || 0
        };
      }
    }

    // Severity distribution is now computed from patterns, not overall_score
    // Since extracting max severity from JSON in SQLite is complex, we skip this for now
    const riskScoreDistribution: Record<string, number> = {};

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

    // If table doesn't exist, return empty stats instead of error
    if (error.message?.includes('no such table')) {
      const byCategory: Record<string, any> = {};
      for (const cat of DEFAULT_CATEGORIES) {
        byCategory[cat] = {
          count: 0,
          detections: 0,
          statistics: { mean: 0, stddev: 0, quantiles: { p5: 0, p50: 0, p95: 0 } }
        };
      }
      return c.json({
        totalAnalyzed: 0,
        totalDetections: 0,
        byCategory,
        timeSeries: [],
        modelPerformance: {},
        riskScoreDistribution: {},
        message: 'No audit results yet. Run audits from the Queue tab to populate the dashboard.'
      });
    }

    return c.json({ error: error.message || 'Failed to fetch dashboard stats' }, 500);
  }
});
