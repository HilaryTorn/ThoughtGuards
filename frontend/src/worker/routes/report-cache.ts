/**
 * Report Cache API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const reportCacheRoutes = new Hono<{ Bindings: Env }>();

// Ensure table exists
async function ensureTableExists(db: D1Database) {
  try {
    await db.prepare('SELECT 1 FROM report_cache LIMIT 1').first();
  } catch (error: any) {
    if (error.message?.includes('no such table')) {
      console.warn('report_cache table does not exist. Run schema migration.');
    }
  }
}

// Get cache stats
reportCacheRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  await ensureTableExists(db);

  try {
    const totalResult = await db.prepare('SELECT COUNT(*) as count FROM report_cache').first<{ count: number }>();
    const expiredResult = await db.prepare(
      'SELECT COUNT(*) as count FROM report_cache WHERE expires_at < ?'
    ).bind(new Date().toISOString()).first<{ count: number }>();

    return c.json({
      total_entries: totalResult?.count || 0,
      expired_entries: expiredResult?.count || 0,
      active_entries: (totalResult?.count || 0) - (expiredResult?.count || 0)
    });
  } catch (error: any) {
    console.error('Error getting cache stats:', error);
    return c.json({ error: error.message || 'Failed to get cache stats' }, 500);
  }
});

// Get cached report
reportCacheRoutes.get('/:cacheKey', async (c) => {
  const db = c.env.DB;
  const cacheKey = c.req.param('cacheKey');

  try {
    const result = await db.prepare(`
      SELECT * FROM report_cache
      WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > ?)
    `).bind(cacheKey, new Date().toISOString()).first();

    if (!result) {
      return c.json({ error: 'Cache miss' }, 404);
    }

    // Update hit count
    await db.prepare(`
      UPDATE report_cache SET hit_count = hit_count + 1, last_accessed = ? WHERE cache_key = ?
    `).bind(new Date().toISOString(), cacheKey).run();

    return c.json({
      cache_key: result.cache_key,
      report_id: result.report_id,
      report_data: result.report_data ? JSON.parse(result.report_data as string) : null,
      created_at: result.created_at,
      expires_at: result.expires_at,
      hit_count: result.hit_count
    });
  } catch (error: any) {
    console.error('Error fetching cache:', error);
    return c.json({ error: error.message || 'Failed to fetch cache' }, 500);
  }
});

// Delete cached report
reportCacheRoutes.delete('/:cacheKey', async (c) => {
  const db = c.env.DB;
  const cacheKey = c.req.param('cacheKey');

  try {
    await db.prepare('DELETE FROM report_cache WHERE cache_key = ?').bind(cacheKey).run();
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error invalidating cache:', error);
    return c.json({ error: error.message || 'Failed to invalidate cache' }, 500);
  }
});

// Bulk invalidate
reportCacheRoutes.post('/invalidate', async (c) => {
  const db = c.env.DB;

  try {
    const body = await c.req.json();
    const cacheKeys = body.cache_keys || [];

    if (!Array.isArray(cacheKeys) || cacheKeys.length === 0) {
      return c.json({ error: 'cache_keys array required' }, 400);
    }

    for (const key of cacheKeys) {
      await db.prepare('DELETE FROM report_cache WHERE cache_key = ?').bind(key).run();
    }

    return c.json({
      success: true,
      invalidated: cacheKeys.length
    });
  } catch (error: any) {
    console.error('Error bulk invalidating cache:', error);
    return c.json({ error: error.message || 'Failed to bulk invalidate cache' }, 500);
  }
});

// Clean expired entries
reportCacheRoutes.post('/clean', async (c) => {
  const db = c.env.DB;

  try {
    const result = await db.prepare(
      'DELETE FROM report_cache WHERE expires_at IS NOT NULL AND expires_at < ?'
    ).bind(new Date().toISOString()).run();

    return c.json({
      success: true,
      cleaned: result.meta?.changes || 0
    });
  } catch (error: any) {
    console.error('Error cleaning expired cache:', error);
    return c.json({ error: error.message || 'Failed to clean expired cache' }, 500);
  }
});
