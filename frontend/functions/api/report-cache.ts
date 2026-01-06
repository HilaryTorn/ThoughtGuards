import { checkCache, storeCache, invalidateCache, getCacheStats, cleanExpiredCache } from '../../lib/reportCache';

/**
 * API endpoints for cache management
 * GET /api/report-cache/:cache_key - Get cached report
 * DELETE /api/report-cache/:cache_key - Invalidate cache
 * POST /api/report-cache/invalidate - Bulk invalidation
 * GET /api/report-cache/stats - Cache statistics
 */

export async function onRequest(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(p => p);
  
  // Ensure report_cache table exists
  await ensureTableExists(env.DB);
  
  if (request.method === 'GET') {
    if (pathParts.length === 4 && pathParts[3] === 'stats') {
      // GET /api/report-cache/stats
      return handleGetStats(env.DB);
    } else if (pathParts.length === 4 && pathParts[3]) {
      // GET /api/report-cache/:cache_key
      return handleGetCache(env.DB, pathParts[3]);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid path' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else if (request.method === 'DELETE') {
    if (pathParts.length === 4 && pathParts[3]) {
      // DELETE /api/report-cache/:cache_key
      return handleDeleteCache(env.DB, pathParts[3]);
    } else {
      return new Response(JSON.stringify({ error: 'Cache key required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else if (request.method === 'POST') {
    if (pathParts.length === 4 && pathParts[3] === 'invalidate') {
      // POST /api/report-cache/invalidate
      return handleBulkInvalidate(request, env.DB);
    } else if (pathParts.length === 4 && pathParts[3] === 'clean') {
      // POST /api/report-cache/clean - Clean expired entries
      return handleCleanExpired(env.DB);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid path' }), {
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
 * Ensure report_cache table exists
 */
async function ensureTableExists(db: any): Promise<void> {
  try {
    await db.prepare('SELECT 1 FROM report_cache LIMIT 1').first();
  } catch (error: any) {
    if (error.message?.includes('no such table')) {
      console.warn('report_cache table does not exist. Run schema migration.');
    }
  }
}

/**
 * GET /api/report-cache/:cache_key - Get cached report
 */
async function handleGetCache(db: any, cacheKey: string): Promise<Response> {
  try {
    const report = await checkCache(db, cacheKey);
    
    if (!report) {
      return new Response(JSON.stringify({ error: 'Cache miss' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(report), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error fetching cache:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch cache',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * DELETE /api/report-cache/:cache_key - Invalidate cache
 */
async function handleDeleteCache(db: any, cacheKey: string): Promise<Response> {
  try {
    await invalidateCache(db, cacheKey);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error invalidating cache:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to invalidate cache',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/report-cache/invalidate - Bulk invalidation
 */
async function handleBulkInvalidate(request: Request, db: any): Promise<Response> {
  try {
    const body = await request.json();
    const cacheKeys = body.cache_keys || [];
    
    if (!Array.isArray(cacheKeys) || cacheKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'cache_keys array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Invalidate each key
    for (const key of cacheKeys) {
      await invalidateCache(db, key);
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      invalidated: cacheKeys.length 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error bulk invalidating cache:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to bulk invalidate cache',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/report-cache/stats - Cache statistics
 */
async function handleGetStats(db: any): Promise<Response> {
  try {
    const stats = await getCacheStats(db);
    
    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error getting cache stats:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to get cache stats',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/report-cache/clean - Clean expired entries
 */
async function handleCleanExpired(db: any): Promise<Response> {
  try {
    const cleanedCount = await cleanExpiredCache(db);
    
    return new Response(JSON.stringify({ 
      success: true,
      cleaned: cleanedCount 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Error cleaning expired cache:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to clean expired cache',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

